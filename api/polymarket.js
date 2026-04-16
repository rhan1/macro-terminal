export const config = { runtime: "edge" };

const BASE_URL = "https://gamma-api.polymarket.com";

const TAG_SLUGS = [
  "fed-rates",
  "economics",
  "macro-indicators",
  "inflation",
  "gdp",
  "trade-war",
  "global-rates",
  "treasuries",
  "forex",
];

async function fetchTag(tag) {
  const url =
    `${BASE_URL}/events?tag_slug=${tag}&active=true&closed=false` +
    `&limit=20&order=volume24hr&ascending=false&volume_min=1000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Polymarket tag ${tag}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.events ?? [];
}

function parseOutcomePrices(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parseFloat(parsed[0]);
    }
  } catch {
    // fall through
  }
  return null;
}

function pickActiveMarket(markets) {
  if (!Array.isArray(markets)) return null;
  const active = markets.filter((m) => m.active && !m.closed);
  return active.length > 0 ? active[0] : markets[0] ?? null;
}

export default async function handler() {
  try {
    const results = await Promise.allSettled(TAG_SLUGS.map(fetchTag));

    // Deduplicate events by id
    const seen = new Set();
    const events = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const event of result.value) {
        if (!event.id || seen.has(event.id)) continue;
        seen.add(event.id);
        events.push(event);
      }
    }

    const markets = [];

    for (const event of events) {
      const market = pickActiveMarket(event.markets);
      if (!market) continue;

      const probability = parseOutcomePrices(market.outcomePrices);
      if (probability === null) continue;

      const tags = Array.isArray(event.tags)
        ? event.tags.map((t) => t.slug ?? t).filter(Boolean)
        : [];

      markets.push({
        id: String(event.id),
        slug: event.slug ?? null,
        title: event.title ?? null,
        tags,
        probability,
        probability_pct: Math.round(probability * 100),
        volume_total: parseFloat(event.volume ?? event.volume24hr ?? "0"),
        liquidity: parseFloat(event.liquidity ?? "0"),
        end_date: event.endDate ?? null,
        market_count: Array.isArray(event.markets) ? event.markets.length : 1,
        url: `https://polymarket.com/event/${event.slug ?? event.id}`,
      });
    }

    markets.sort((a, b) => b.volume_total - a.volume_total);
    const top = markets.slice(0, 15);

    return new Response(JSON.stringify(top), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, markets: [] }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
