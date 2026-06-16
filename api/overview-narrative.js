// Serves the Perplexity-sourced "today's market drivers" paragraph out of
// Netlify Blobs. The hourly refresh lives in api/cron/refresh-narrative.js
// (Perplexity Sonar Pro → Blob); this endpoint is a lightweight read path.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "overview/narrative.json";

export default async function handler(req, res) {
  try {
    const snapshot = await getJSON(BLOB_PATH);
    if (!snapshot) {
      // null means key doesn't exist yet — expected before first cron run.
      return res.status(200).json({ error: "not-yet-refreshed", paragraph: null, sources: [] });
    }
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.setHeader("X-Narrative-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", paragraph: null, sources: [] });
  }
}
