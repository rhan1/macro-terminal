// Serves the eurogirlsescort advertised-rate pilot snapshot out of Netlify Blobs.
// Populated by scripts/egs-rates-pilot.mjs (Firecrawl sweep of ~12 countries,
// median 1-hour rate normalized to USD). History at egs/rates-history.json.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "egs/rates-snapshot.json";

export default async function handler(req, res) {
  try {
    const snapshot = await getJSON(BLOB_PATH);
    if (!snapshot) {
      return res.status(200).json({ error: "not-yet-seeded", countries: [] });
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    res.setHeader("X-Snapshot-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", countries: [] });
  }
}
