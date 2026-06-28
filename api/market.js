export default async function handler(req, res) {
  // Chart history mode: /api/market?chart=SPY&range=1y
  if (req.query.chart) {
    try {
      const sym = req.query.chart;
      const range = req.query.range || "1y";
      const interval = req.query.interval || "1d";
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!resp.ok) throw new Error(`Yahoo chart ${sym}: ${resp.status}`);
      const json = await resp.json();
      const result = json.chart?.result?.[0];
      if (!result) throw new Error(`No chart data for ${sym}`);

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          points.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            close: closes[i],
          });
        }
      }

      const prevClose = result.meta.chartPreviousClose;
      const price = result.meta.regularMarketPrice;

      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json({
        symbol: sym.replace("^", ""),
        points,
        meta: {
          price,
          changePct: prevClose ? ((price - prevClose) / Math.abs(prevClose)) * 100 : 0,
          fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const symbols = (req.query.symbols || "SPY,QQQ,TLT,GLD,USO,HYG,^VIX").split(",");

  // Fetch a single symbol from Yahoo Finance with a given range.
  // Returns the parsed result object or throws.
  async function fetchYahoo(sym, range = "5d") {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`;
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) throw new Error(`Yahoo ${sym}: ${resp.status}`);
    const json = await resp.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`No data for ${sym}`);
    return result;
  }

  // Build a sparkline chart array (last N closes) from a Yahoo result object.
  function buildChart(result) {
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        points.push({
          date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          close: closes[i],
        });
      }
    }
    return points;
  }

  // Special handler for DXY: try ^DXY first, fall back to DX-Y.NYB.
  async function fetchDXY() {
    for (const dxySym of ["^DXY", "DX-Y.NYB"]) {
      try {
        // Use 1mo range so we get ~30 days for the sparkline used by GlobalRegimeBanner
        const result = await fetchYahoo(dxySym, "1mo");
        const meta = result.meta;
        const closes = result.indicators?.quote?.[0]?.close || [];
        const price = meta.regularMarketPrice;
        if (!price) continue;
        const prevClose =
          closes.filter(Boolean).length >= 2
            ? closes.filter(Boolean)[closes.filter(Boolean).length - 2]
            : meta.chartPreviousClose;
        const changePct = prevClose ? ((price - prevClose) / Math.abs(prevClose)) * 100 : 0;
        const chart = buildChart(result);
        return {
          symbol: "DXY",
          name: "US Dollar Index",
          price,
          changePct,
          prevClose,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          chart,
        };
      } catch {
        // try next symbol
      }
    }
    throw new Error("DXY: all sources failed");
  }

  try {
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        // Route DXY through its dedicated fallback handler
        const isDXY = sym === "^DXY" || sym === "DXY";
        if (isDXY) return fetchDXY();

        const result = await fetchYahoo(sym, "5d");
        const meta = result.meta;
        const price = meta.regularMarketPrice;
        // Prefer meta.regularMarketChangePercent (avoids 5d day-count mismatch on index tickers like ^GSPC vs SPY)
        const changePct =
          meta.regularMarketChangePercent != null
            ? meta.regularMarketChangePercent
            : (() => {
                const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose;
                return prevClose ? ((price - prevClose) / Math.abs(prevClose)) * 100 : 0;
              })();
        const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose;

        return {
          symbol: sym.replace("^", ""),
          name: meta.shortName || meta.longName || sym,
          price,
          changePct,
          prevClose,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        };
      })
    );

    const data = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        data[r.value.symbol] = r.value;
      }
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
