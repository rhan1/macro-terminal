// Serves the Capitol Trades Blob written by /api/cron/refresh-capitol.
// Narrows the trade list to a requested period, passes through aggregates.
import { head } from "@vercel/blob";

const BLOB_PATH = "capitol/trades.json";

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

  const period = parseInt(req.query?.period || "30", 10);
  const limit = Math.min(1000, parseInt(req.query?.limit || "200", 10));
  const cutoff = daysAgoIso(Math.max(1, period));

  try {
    const meta = await head(BLOB_PATH, { token });
    const resp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`blob fetch ${resp.status}`);
    const blob = await resp.json();

    const allTrades = Array.isArray(blob.trades) ? blob.trades : [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const filings7d = allTrades.filter((t) => t.filedDate && t.filedDate >= sevenDaysAgo).length;
    const scoped = allTrades
      .filter((t) => (t.tradeDate || "") >= cutoff)
      .slice(0, limit);

    return res.status(200).json({
      trades: scoped,
      topBuys: period <= 30 ? blob.topBuys30d : blob.topBuys90d,
      topSells: period <= 30 ? blob.topSells30d : blob.topSells90d,
      clusters: blob.clusters || [],
      committeeAligned: blob.committeeAligned || [],
      sectorFlow: blob.sectorFlow || [],
      leaderboard: blob.leaderboard || [],
      meta: {
        total: allTrades.length,
        period,
        cutoff,
        fetchedAt: blob.fetchedAt,
        filings7d,
      },
    });
  } catch {
    return res.status(200).json({
      trades: [],
      topBuys: [],
      topSells: [],
      clusters: [],
      committeeAligned: [],
      sectorFlow: [],
      leaderboard: [],
      meta: { total: 0, period, cutoff, fetchedAt: null, error: "not-seeded" },
    });
  }
}
