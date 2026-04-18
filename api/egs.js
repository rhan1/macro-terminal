// Serves a pre-scraped snapshot of eurogirlsescort.es country totals.
// Why static: egs origin (Cloudflare) blocks Vercel serverless IPs with a
// Managed Challenge. Residential IPs pass. The snapshot is refreshed locally
// via `npm run refresh-egs` (see scripts/refresh-egs-snapshot.mjs).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SNAPSHOT_PATH = fileURLToPath(new URL("../data/egs-snapshot.json", import.meta.url));
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

export default function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.setHeader("X-Snapshot-FetchedAt", snapshot.fetchedAt);
  return res.status(200).json(snapshot);
}
