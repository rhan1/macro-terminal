import { head } from "@vercel/blob";

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

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

  try {
    const meta = await head(BLOB_PATH, { token });
    const blob = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!blob.ok) throw new Error(`blob ${blob.status}`);
    return res.status(200).json(await blob.json());
  } catch {
    return res.status(200).json(EMPTY);
  }
}
