import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "trends/terms.json";
const EMPTY = {
  terms: [],
  source: "Google Trends (not yet seeded)",
  error: "not-yet-seeded",
};

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=86400, stale-while-revalidate=259200"
  );

  try {
    const body = await getJSON(BLOB_PATH);
    if (!body) throw new Error("not-yet-seeded");
    return res.status(200).json(body);
  } catch {
    return res.status(200).json(EMPTY);
  }
}
