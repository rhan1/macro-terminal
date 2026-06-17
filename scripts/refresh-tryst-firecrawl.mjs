// scripts/refresh-tryst-firecrawl.mjs
// One-shot: revive + backfill the tryst.link gap-country count signal.
//   1. Scrape each LIVE country page via Firecrawl -> today's counts.
//   2. Pull monthly Wayback captures per country   -> historical counts.
//   3. Merge into tryst/history.json, build tryst/snapshot.json.
//   4. Write both blobs to the Netlify "macro-terminal" store.
//
// Env required: FIRECRAWL_API_KEY, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN
// Run:  node scripts/refresh-tryst-firecrawl.mjs [--dry] [--from=20250101]

import { createHash } from "node:crypto";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { getStore } from "@netlify/blobs";
import { mergeHistory, buildSnapshot } from "../netlify/lib/egs-data.mjs";

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
const DRY = process.argv.includes("--dry");
const fromArg = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1];
const FROM = fromArg || "20250101";
const CACHE_DIR = "/tmp/tryst-cache";
const LIVE_CONCURRENCY = 3;

let firecrawlCalls = 0;
let cacheHits = 0;

function log(...a) { console.log(...a); }

function trystUrl(iso) {
  return `https://tryst.link/${iso}/escorts`;
}

function cachePath(url) {
  const hash = createHash("sha1").update(url).digest("hex");
  return `${CACHE_DIR}/${hash}.json`;
}

function readCachedFirecrawl(url) {
  const file = cachePath(url);
  if (!fs.existsSync(file)) return null;
  try {
    cacheHits += 1;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeCachedFirecrawl(url, json) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(url), JSON.stringify(json, null, 2));
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

async function firecrawlLiveJson(url) {
  const cached = readCachedFirecrawl(url);
  if (cached) return cached;

  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY missing");
  log("-> Firecrawl live scrape of", url);
  firecrawlCalls += 1;
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url, formats: ["html"], proxy: "stealth",
      location: { country: "US" }, timeout: 90000, waitFor: 12000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status}`);
  const json = await resp.json();
  writeCachedFirecrawl(url, json);
  return json;
}

async function fetchLiveCountry({ iso, country }) {
  const url = trystUrl(iso);
  const json = await firecrawlLiveJson(url);
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
      try { results[i] = { status: "fulfilled", value: await mapper(items[i], i) }; }
      catch (e) { results[i] = { status: "rejected", reason: e }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function waybackCaptures(iso) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const target = `tryst.link/${iso}/escorts`;
  const cdx =
    `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json` +
    `&from=${FROM}&to=${today}&collapse=timestamp:6&filter=statuscode:200&filter=mimetype:text/html`;
  log("-> Wayback CDX:", cdx);
  const resp = await fetch(cdx, { signal: AbortSignal.timeout(60000) });
  if (!resp.ok) throw new Error(`Wayback CDX HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!rows || rows.length < 2) return [];
  const hdr = rows[0];
  const ti = hdr.indexOf("timestamp"), oi = hdr.indexOf("original");
  return rows.slice(1).map((r) => ({ ts: r[ti], original: r[oi] }));
}

async function fetchArchived(ts, original) {
  const url = `http://web.archive.org/web/${ts}id_/${original}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const html = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return html;
}

function tsToDate(ts) {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

async function main() {
  // 1. live — tolerant: skip countries that fail (no tryst page / parse miss),
  // keep the rest. Only abort if EVERY country failed.
  const liveResults = await poolMap(GAP_COUNTRIES, LIVE_CONCURRENCY, fetchLiveCountry);
  for (const r of liveResults.filter((r) => r.status === "rejected")) {
    log("  live skip:", r.reason?.message ?? r.reason);
  }
  const todayParsed = liveResults
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => b.total - a.total);
  if (!todayParsed.length) throw new Error("live scrape failed for ALL gap countries");
  const today = new Date().toISOString().slice(0, 10);
  log(`  live: ${todayParsed.length} countries, ${todayParsed.reduce((s, c) => s + c.total, 0).toLocaleString()} listings (${today})`);

  // 2. backfill from Wayback, oldest -> newest per country.
  const history = { series: {} };
  for (const meta of GAP_COUNTRIES) {
    let caps = [];
    try {
      caps = (await waybackCaptures(meta.iso)).sort((a, b) => a.ts.localeCompare(b.ts));
      log(`  ${meta.iso}: found ${caps.length} monthly captures`);
    } catch (e) {
      log(`  ${meta.iso}: skip CDX (${e.message})`);
      continue;
    }

    for (const { ts, original } of caps) {
      const date = tsToDate(ts);
      if (date >= today) continue;
      try {
        const html = await fetchArchived(ts, original);
        const total = parseBrowseCount(html);
        if (total == null) { log(`    ${meta.iso} ${date}: no Browse count`); continue; }
        mergeHistory(history, [{ iso: meta.iso, country: meta.country, spanish: meta.country, total }], date);
        log(`    ${meta.iso} ${date}: ${total.toLocaleString()} listings`);
      } catch (e) {
        log(`    ${meta.iso} ${date}: skip (${e.message})`);
      }
    }
  }

  // 3. merge today's live point last, build snapshot
  mergeHistory(history, todayParsed, today);
  const snapshot = buildSnapshot(todayParsed, history, today, { source: "tryst.link" });

  // report
  log(`\n  Firecrawl: ${firecrawlCalls} calls, ${cacheHits} cache hits`);
  log(`  WORLDWIDE MoM: ${snapshot.totalWorldwideMoMPct}%  (total ${snapshot.totalWorldwide.toLocaleString()})`);
  console.table(snapshot.countries.map((c) => ({
    iso: c.iso,
    country: c.country,
    total: c.total,
    momPct: c.momPct,
    "history points": history.series[c.iso]?.length ?? 0,
  })));

  if (DRY) { log("\n[--dry] not writing blobs"); return; }

  // 4. write to Netlify blob
  const siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) throw new Error("NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN missing");
  const store = getStore({ name: "macro-terminal", siteID, token });
  await store.setJSON("tryst/snapshot.json", snapshot);
  await store.setJSON("tryst/history.json", history);
  log("\nOK wrote tryst/snapshot.json + tryst/history.json to Netlify blob store");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
