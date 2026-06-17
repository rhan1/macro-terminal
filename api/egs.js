// Serves the eurogirlsescort.es country snapshot out of Netlify Blobs.
// The weekly refresh lives in api/cron/refresh-egs.js (ScrapingBee + parse)
// and writes snapshot + history back to the same Blob keys.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "egs/snapshot.json";

export default async function handler(req, res) {
  try {
    const snapshot = await getJSON(BLOB_PATH);
    if (!snapshot) {
      return res.status(200).json({ error: "not-yet-seeded", countries: [] });
    }
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");
    res.setHeader("X-Snapshot-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", countries: [] });
  }
}
