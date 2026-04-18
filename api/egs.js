// Serves the eurogirlsescort.es country snapshot out of Vercel Blob.
// The weekly refresh lives in api/cron/refresh-egs.js (ScrapingBee + parse)
// and writes snapshot + history back to the same Blob keys.

const SNAPSHOT_URL = "https://asj7zmgpd4xptrpp.private.blob.vercel-storage.com/egs/snapshot.json";

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(200).json({ error: "BLOB_READ_WRITE_TOKEN not configured", countries: [] });
  }

  try {
    const resp = await fetch(SNAPSHOT_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      return res.status(200).json({ error: `Blob HTTP ${resp.status}`, countries: [] });
    }
    const snapshot = await resp.json();
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");
    res.setHeader("X-Snapshot-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", countries: [] });
  }
}
