// Reads the ACLED maritime-incident feed from Vercel Blob.
// Graceful empty-state when the Blob hasn't been seeded.
import { head } from "@vercel/blob";

const BLOB_PATH = "shipments/incidents.json";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

  try {
    const meta = await head(BLOB_PATH, { token });
    const resp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`blob ${resp.status}`);
    const body = await resp.json();
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
