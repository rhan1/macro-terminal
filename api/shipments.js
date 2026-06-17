// Reads the ACLED maritime-incident feed from Netlify Blobs.
// Graceful empty-state when the Blob hasn't been seeded.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "shipments/incidents.json";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  try {
    const body = await getJSON(BLOB_PATH);
    if (!body) throw new Error("not-seeded");
    return res.status(200).json(body);
  } catch {
    return res.status(200).json({
      incidents: [],
      byChokepoint: {},
      countries: [],
      chokepoints: [],
      windowDays: 0,
      fetchedAt: null,
      error: "not-seeded",
    });
  }
}
