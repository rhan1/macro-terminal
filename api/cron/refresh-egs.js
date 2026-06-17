// Weekly refresh of the eurogirlsescort country-count signal.
// Scrapes eurogirlsescort.es through Firecrawl's stealth proxy (beats the
// Cloudflare Managed Challenge that killed the old ScrapingBee path), parses
// the country sidebar, merges into Blob-backed history, and writes fresh
// snapshot/history (with week-over-week + month-over-month deltas) back to
// the private Netlify Blob store.
// Manual invoke:
//   curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://<deploy>/.netlify/functions/cron-refresh-egs

import { putJSON, getJSON } from "../../netlify/lib/netlify-blob.mjs";
import { extractCounts, mergeHistory, buildSnapshot } from "../../netlify/lib/egs-data.mjs";

const SITE_URL = "https://www.eurogirlsescort.es/";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function firecrawlHtml(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["html"],
      proxy: "stealth",
      location: { country: "US" },
      timeout: 60000,
      waitFor: 3500,
    }),
    signal: AbortSignal.timeout(75000),
  });
  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status}`);
  const json = await resp.json();
  const html = json?.data?.html ?? json?.data?.rawHtml ?? "";
  if (!html || html.length < 100_000) throw new Error("Firecrawl returned too little HTML (blocked?)");
  return html;
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const html = await firecrawlHtml(SITE_URL);
    const parsed = extractCounts(html);
    if (!parsed.length) return res.status(500).json({ error: "parse failed" });

    const date = todayIso();
    const history = (await getJSON("egs/history.json")) ?? { series: {} };
    mergeHistory(history, parsed, date);
    const snapshot = buildSnapshot(parsed, history, date);

    await Promise.all([
      putJSON("egs/snapshot.json", snapshot),
      putJSON("egs/history.json", history),
    ]);

    return res.status(200).json({
      ok: true,
      countries: snapshot.countriesCount,
      totalWorldwide: snapshot.totalWorldwide,
      totalWorldwideMoMPct: snapshot.totalWorldwideMoMPct,
      fetchedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
