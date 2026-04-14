export default async function handler(req, res) {
  const { series_id, limit = "30", units, sort_order = "desc" } = req.query;

  if (!series_id) {
    return res.status(400).json({ error: "series_id required" });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FRED_API_KEY not configured" });
  }

  const params = new URLSearchParams({
    series_id,
    api_key: apiKey,
    file_type: "json",
    sort_order,
    limit,
  });
  if (units) params.set("units", units);

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
