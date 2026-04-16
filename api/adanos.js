export default async function handler(req, res) {
  const key = process.env.ADANOS_API_KEY;
  if (!key) {
    return res.status(200).json({ error: "ADANOS_API_KEY not configured" });
  }

  try {
    const endpoint = req.query.endpoint || "trending";
    const tickers = req.query.tickers || "";
    const base = "https://api.adanos.org/reddit/stocks/v1";

    let url;
    if (endpoint === "compare" && tickers) {
      url = `${base}/compare?tickers=${encodeURIComponent(tickers)}`;
    } else if (endpoint === "stock" && tickers) {
      url = `${base}/stock/${encodeURIComponent(tickers)}`;
    } else if (endpoint === "market-sentiment") {
      url = `${base}/market-sentiment`;
    } else {
      url = `${base}/trending`;
    }

    const resp = await fetch(url, {
      headers: {
        "X-API-Key": key,
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!resp.ok) throw new Error(`Adanos: ${resp.status}`);
    const json = await resp.json();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
