// Monthly refresh of the tryst.link gap-country count signal.
// Scrapes each JS-rendered country page through Firecrawl, parses the
// "Browse N verified escorts" count, merges into Blob-backed history, and
// writes fresh snapshot/history back to the private Netlify Blob store.
// Manual invoke:
//   curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://<deploy>/.netlify/functions/cron-refresh-tryst

import { putJSON, getJSON } from "../../netlify/lib/netlify-blob.mjs";
import { mergeHistory, buildSnapshot } from "../../netlify/lib/egs-data.mjs";

const GAP_COUNTRIES = [
  { iso: "us", country: "United States" },
  { iso: "mx", country: "Mexico" },
  { iso: "jp", country: "Japan" },
  { iso: "kr", country: "South Korea" },
  { iso: "th", country: "Thailand" },
  { iso: "ph", country: "Philippines" },
  { iso: "sg", country: "Singapore" },
  { iso: "au", country: "Australia" },
  { iso: "nz", country: "New Zealand" },
  { iso: "fr", country: "France" },
  { iso: "it", country: "Italy" },
  { iso: "ie", country: "Ireland" },
  { iso: "fi", country: "Finland" },
  { iso: "br", country: "Brazil" },
];

const COUNT_RE = /Browse\s+([\d,]+)\s+verified\s+escorts/i;
const CONCURRENCY = 3;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function trystUrl(iso) {
  return `https://tryst.link/${iso}/escorts`;
}

function parseBrowseCount(text) {
  const m = String(text ?? "").match(COUNT_RE);
  if (!m) return null;
  const total = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(total) ? total : null;
}

function parseFirecrawlCount(json) {
  const byDescription = parseBrowseCount(json?.data?.metadata?.description);
  if (byDescription != null) return byDescription;
  return parseBrowseCount(json?.data?.html ?? json?.data?.rawHtml ?? "");
}

async function firecrawlJson(url) {
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
      timeout: 90000,
      waitFor: 12000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status}`);
  return await resp.json();
}

async function fetchCountry({ iso, country }) {
  const url = trystUrl(iso);
  const json = await firecrawlJson(url);
  const total = parseFirecrawlCount(json);
  if (total == null) throw new Error(`count parse failed for ${url}`);
  return { iso, country, spanish: country, total };
}

async function poolMap(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const results = await poolMap(GAP_COUNTRIES, CONCURRENCY, async (meta) => {
      try {
        return await fetchCountry(meta);
      } catch (err) {
        console.error(`tryst ${meta.iso}: ${err?.message ?? err}`);
        return null;
      }
    });

    const parsed = results.filter(Boolean).sort((a, b) => b.total - a.total);
    if (!parsed.length) return res.status(500).json({ error: "parse failed" });

    const date = todayIso();
    const history = (await getJSON("tryst/history.json")) ?? { series: {} };
    mergeHistory(history, parsed, date);
    const snapshot = buildSnapshot(parsed, history, date, { source: "tryst.link" });

    await Promise.all([
      putJSON("tryst/snapshot.json", snapshot),
      putJSON("tryst/history.json", history),
    ]);

    return res.status(200).json({
      ok: true,
      countries: snapshot.countriesCount,
      totalWorldwide: snapshot.totalWorldwide,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
