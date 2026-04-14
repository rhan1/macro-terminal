export default async function handler(req, res) {
  const symbols = (req.query.symbols || "SPY,QQQ,TLT,GLD,USO,HYG,^VIX").split(",");

  try {
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!resp.ok) throw new Error(`Yahoo ${sym}: ${resp.status}`);
        const json = await resp.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta) throw new Error(`No data for ${sym}`);

        const closes = json.chart.result[0].indicators?.quote?.[0]?.close || [];
        const prevClose = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;
        const price = meta.regularMarketPrice;
        const changePct = prevClose ? ((price - prevClose) / Math.abs(prevClose)) * 100 : 0;

        return {
          symbol: sym.replace("^", ""),
          name: meta.shortName || meta.longName || sym,
          price: price,
          changePct: changePct,
          prevClose: prevClose,
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

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
