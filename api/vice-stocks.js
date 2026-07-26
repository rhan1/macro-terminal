export default async function handler(req, res) {
  // Default ticker universe spans vice-economy sub-sectors (adult, gambling,
  // alcohol, tobacco, cannabis, firearms, dating) plus the recession-proxy
  // Stress Economy tickers (dollar stores, pawn shops). Expanded 2026-04-18.
  const DEFAULT_SYMBOLS = [
    // Adult Entertainment
    "RICK",
    // Gambling & Casinos
    "MGM", "LVS", "WYNN", "CZR", "DKNG", "PENN", "BYD", "BALY",
    // Alcohol / Beer / Spirits
    "DEO", "STZ", "BUD", "SAM", "TAP",
    // Tobacco
    "MO", "PM", "BTI",
    // Cannabis
    "TLRY", "CGC", "ACB", "CRON", "SNDL",
    // Firearms & Ammo
    "SWBI", "RGR", "OLN",
    // Dating
    "MTCH", "BMBL",
    // Dollar Stores (Stress Economy)
    "DG", "DLTR", "FIVE",
    // Pawn Shops (Stress Economy)
    "EZPW", "FCFS",
  ];
  const symbols = (req.query.symbols || DEFAULT_SYMBOLS.join(",")).split(",").map((s) => s.trim().toUpperCase());
  const range = req.query.range || "1y";
  const validRanges = ["1mo", "3mo", "6mo", "1y", "5y"];
  const safeRange = validRanges.includes(range) ? range : "1y";

  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${safeRange}`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
      if (!resp.ok) throw new Error(`Yahoo Finance ${sym}: HTTP ${resp.status}`);
      const json = await resp.json();

      const result = json.chart?.result?.[0];
      if (!result) throw new Error(`No chart data returned for ${sym}`);

      const meta = result.meta;
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];

      const chart = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          chart.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            close: closes[i],
          });
        }
      }

      const price = meta.regularMarketPrice;
      const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? chart.at(-2)?.close ?? null;
      const change = prevClose != null ? price - prevClose : 0;
      const changePct = prevClose ? (change / Math.abs(prevClose)) * 100 : 0;

      return {
        symbol: sym,
        name: meta.shortName || meta.longName || sym,
        price,
        change,
        changePct,
        high52w: meta.fiftyTwoWeekHigh ?? null,
        low52w: meta.fiftyTwoWeekLow ?? null,
        chart,
      };
    })
  );

  const stocks = {};
  const failedSymbols = new Set();
  for (let i = 0; i < symbols.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      const { symbol, ...data } = r.value;
      stocks[symbol] = data;
    } else {
      // Drop failed tickers from output so errored symbols don't emit em-dash cards
      failedSymbols.add(symbols[i]);
    }
  }

  const categoriesRaw = {
    "Adult Entertainment": ["RICK"],
    "Gambling & Casinos": ["MGM", "LVS", "WYNN", "CZR", "DKNG", "PENN", "BYD", "BALY"],
    "Alcohol": ["DEO", "STZ", "BUD", "SAM", "TAP"],
    "Tobacco": ["MO", "PM", "BTI"],
    "Cannabis": ["TLRY", "CGC", "ACB", "CRON", "SNDL"],
    "Firearms & Ammo": ["SWBI", "RGR", "OLN"],
    "Dating": ["MTCH", "BMBL"],
    "Dollar Stores": ["DG", "DLTR", "FIVE"],
    "Pawn Shops": ["EZPW", "FCFS"],
  };
  // Drop failed tickers from category arrays so UI never renders em-dash cards
  const categories = {};
  for (const [cat, tickers] of Object.entries(categoriesRaw)) {
    const filtered = tickers.filter((t) => !failedSymbols.has(t));
    if (filtered.length > 0) categories[cat] = filtered;
  }

  // Groups: which categories belong to which top-level section in the UI
  const groups = {
    "Vice Stocks": ["Adult Entertainment", "Gambling & Casinos", "Alcohol", "Tobacco", "Cannabis", "Firearms & Ammo", "Dating"],
    "Stress Economy": ["Dollar Stores", "Pawn Shops"],
  };

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json({
    stocks,
    categories,
    groups,
    updated: new Date().toISOString(),
  });
}
