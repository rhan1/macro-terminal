/**
 * /api/fred-batch  — server-side fan-out for FRED series
 *
 * POST body: { series: [{ key, id, units, limit }] }
 * GET  ?series=<JSON>  (for quick browser testing)
 *
 * Response: { data: { [key]: observations[] }, errors: { [key]: message } }
 *
 * Each series is fetched in parallel with up to 3 retries on 429/5xx.
 * Cache-Control: s-maxage=3600, stale-while-revalidate=7200
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const MAX_RETRIES = 3;

async function fetchOneSeries(apiKey, { id, units, limit = 30 }) {
  const params = new URLSearchParams({
    series_id: id,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: String(limit),
  });
  if (units) params.set("units", units);

  const url = `${FRED_BASE}?${params}`;
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
    }
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // retry
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => res.status);
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const json = await res.json();
      return (json.observations || [])
        .filter((o) => o.value !== ".")
        .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export default async function handler(req, res) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FRED_API_KEY not configured" });
  }

  // Support both POST (preferred) and GET (testing)
  let seriesList;
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      seriesList = body?.series;
    } else {
      const raw = req.query?.series;
      if (!raw) return res.status(400).json({ error: "series param required" });
      seriesList = JSON.parse(raw);
    }
  } catch {
    return res.status(400).json({ error: "Invalid JSON in request" });
  }

  if (!Array.isArray(seriesList) || seriesList.length === 0) {
    return res.status(400).json({ error: "series must be a non-empty array" });
  }

  // Fan out all fetches in parallel; never let one failure drop the rest
  const results = await Promise.allSettled(
    seriesList.map((s) => fetchOneSeries(apiKey, s).then((obs) => ({ key: s.key, obs })))
  );

  const data = {};
  const errors = {};

  seriesList.forEach((s, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      data[s.key] = r.value.obs;
    } else {
      errors[s.key] = r.reason?.message ?? String(r.reason);
    }
  });

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  return res.status(200).json({ data, errors });
}
