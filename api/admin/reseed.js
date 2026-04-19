// One-shot fan-out trigger for all cron endpoints. Hit with the CRON_SECRET
// as a Bearer to seed freshly-deployed crons in sequence without needing to
// curl each one individually. Returns a per-cron status map.
const CRONS = [
  { path: "/api/cron/refresh-egs",           name: "egs" },
  { path: "/api/cron/refresh-narrative",     name: "narrative" },
  { path: "/api/cron/refresh-layoffs",       name: "layoffs" },
  { path: "/api/cron/refresh-capitol",       name: "capitol" },
  { path: "/api/cron/refresh-committees",    name: "committees" },
  { path: "/api/cron/refresh-global-yields", name: "globalYields" },
  { path: "/api/cron/refresh-central-banks", name: "centralBanks" },
  { path: "/api/cron/refresh-acled",         name: "acled" },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const base = `${proto}://${host}`;
  const filter = (req.query?.only || "").split(",").map((s) => s.trim()).filter(Boolean);

  const targets = filter.length
    ? CRONS.filter((c) => filter.includes(c.name))
    : CRONS;

  const results = {};
  for (const c of targets) {
    const started = Date.now();
    try {
      const r = await fetch(`${base}${c.path}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(120000),
      });
      const elapsed = Date.now() - started;
      let body = null;
      try { body = await r.json(); } catch {}
      results[c.name] = { status: r.status, ok: r.ok, elapsedMs: elapsed, body };
    } catch (err) {
      results[c.name] = { status: 0, ok: false, error: err?.message || "fetch failed" };
    }
  }

  return res.status(200).json({
    ok: Object.values(results).every((r) => r.ok || r.status === 404),
    results,
    fetchedAt: new Date().toISOString(),
  });
}
