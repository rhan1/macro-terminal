// Serves the tryst.link gap-country snapshot out of Netlify Blobs.
// The monthly refresh lives in api/cron/refresh-tryst.js and writes snapshot +
// history back to the same Blob keys.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "tryst/snapshot.json";

export default async function handler(req, res) {
  try {
    const snapshot = await getJSON(BLOB_PATH);
    if (!snapshot) {
      return res.status(200).json({ error: "not-yet-seeded", countries: [] });
    }
    res.setHeader("Cache-Control", "s-maxage=2592000, stale-while-revalidate");
    res.setHeader("X-Snapshot-FetchedAt", snapshot.fetchedAt ?? "");
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ error: err?.message ?? "Unknown", countries: [] });
  }
}
