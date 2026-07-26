import { getJSON } from "../netlify/lib/netlify-blob.mjs";

export default async function handler(req, res) {
  const snapshot = await getJSON("economies/snapshot.json");
  if (!snapshot) return res.status(200).json({ error: "not-yet-seeded" });
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
  return res.status(200).json(snapshot);
}
