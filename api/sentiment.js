export default async function handler(req, res) {
  try {
    const action = req.query.action || "all";
    const allowed = ["all", "insider", "liquidity", "regime", "news"];
    if (!allowed.includes(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }
    const resp = await fetch(`https://feargreedchart.com/api/?action=${action}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) throw new Error(`FearGreedChart API: ${resp.status}`);
    const json = await resp.json();
    const ttl = action === "news" ? 900 : 300;
    res.setHeader("Cache-Control", `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
