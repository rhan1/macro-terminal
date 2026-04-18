// Serves the Perplexity-sourced "today's market drivers" paragraph out of
// Vercel Blob. The hourly refresh lives in api/cron/refresh-narrative.js
// (Perplexity Sonar Pro → Blob); this endpoint is a lightweight read path.

const NARRATIVE_URL = "https://asj7zmgpd4xptrpp.private.blob.vercel-storage.com/overview/narrative.json";

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(200).json({ error: "BLOB_READ_WRITE_TOKEN not configured", paragraph: null, sources: [] });
  }

  try {
    const resp = await fetch(NARRATIVE_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      // 404 is expected before the first cron run; not an error.
      const reason = resp.status === 404 ? "not-yet-refreshed" : `Blob HTTP ${resp.status}`;
      return res.status(200).json({ error: reason, paragraph: null, sources: [] });
    }
    const snapshot = await resp.json();
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.setHeader("X-Narrative-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", paragraph: null, sources: [] });
  }
}
