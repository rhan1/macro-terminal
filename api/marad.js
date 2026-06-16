import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "shipments/advisories.json";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  try {
    const body = await getJSON(BLOB_PATH);
    if (!body) throw new Error("not-yet-seeded");
    return res.status(200).json(body);
  } catch {
    return res.status(200).json({
      advisories: [],
      fetchedAt: null,
      error: "not-yet-seeded",
    });
  }
}
