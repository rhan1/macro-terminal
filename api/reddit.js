export default async function handler(req, res) {
  try {
    const filter = req.query.filter || "all-stocks";
    const resp = await fetch(
      `https://apewisdom.io/api/v1.0/filter/${encodeURIComponent(filter)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!resp.ok) throw new Error(`ApeWisdom: ${resp.status}`);
    const json = await resp.json();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
