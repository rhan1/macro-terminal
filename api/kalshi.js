const BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

const SERIES = [
  "KXRECSSNBER",
  "KXRATECUTCOUNT",
  "KXFEDDECISION",
  "KXFED",
  "KXEFFTARIFF",
  "KXNBERRECESSQ",
  "KX10Y2Y",
  "KX3MTBILL",
  "KXCPICORE",
  "KXECONSTATU3",
  "KXGDP",
  "KXEMERCUTS",
];

function pickBestMarket(markets) {
  const active = markets.filter((m) => m.status === "active");
  const pool = active.length > 0 ? active : markets;
  if (pool.length === 0) return null;
  return pool.reduce((best, m) => {
    const vol = parseFloat(m.volume_24h_fp ?? "0");
    const bestVol = parseFloat(best.volume_24h_fp ?? "0");
    return vol > bestVol ? m : best;
  }, pool[0]);
}

async function fetchSeries(ticker) {
  const url = `${BASE_URL}/events?series_ticker=${ticker}&with_nested_markets=true&limit=3`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Kalshi ${ticker}: ${res.status}`);
  const data = await res.json();
  return { ticker, events: data.events ?? [] };
}

export default async function handler(req, res) {
  try {
    const results = await Promise.allSettled(SERIES.map(fetchSeries));

    const markets = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { ticker, events } = result.value;

      for (const event of events) {
        const nestedMarkets = event.markets ?? [];
        if (nestedMarkets.length === 0) continue;

        const best = pickBestMarket(nestedMarkets);
        if (!best) continue;
        // Skip finalized/voided/settled events — only emit active markets
        if (best.status !== "active") continue;

        const probability = parseFloat(best.last_price_dollars ?? best.last_price_fp ?? "0");
        const volume_total = parseFloat(best.volume_fp ?? "0");
        const volume_24h = parseFloat(best.volume_24h_fp ?? "0");
        const open_interest = parseFloat(best.open_interest_fp ?? "0");

        markets.push({
          id: best.ticker,
          title: event.title ?? ticker,
          subtitle: event.sub_title ?? null,
          category: event.category ?? null,
          series: ticker,
          probability,
          probability_pct: Math.round(probability * 100),
          volume_total,
          volume_24h,
          open_interest,
          close_time: best.close_time ?? null,
          market_title: best.title ?? null,
          url: `https://kalshi.com/markets/${ticker}`,
        });
      }
    }

    markets.sort((a, b) => b.volume_24h - a.volume_24h);
    const top = markets.filter((m) => m.volume_24h >= 10).slice(0, 15);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ markets: top, updated: new Date().toISOString() });
  } catch (err) {
    return res.status(200).json({ error: err.message, markets: [] });
  }
}
