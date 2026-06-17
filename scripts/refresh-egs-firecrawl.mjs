// scripts/refresh-egs-firecrawl.mjs
// One-shot: revive + backfill the eurogirlsescort country-count signal.
//   1. Scrape the LIVE page via Firecrawl stealth  -> today's counts.
//   2. Pull ~monthly Wayback captures              -> historical counts.
//   3. Merge into egs/history.json, compute WoW + MoM, build egs/snapshot.json.
//   4. Write both blobs to the Netlify "macro-terminal" store.
//
// Env required: FIRECRAWL_API_KEY, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN
// Run:  node scripts/refresh-egs-firecrawl.mjs [--dry] [--from=20250101]

import { gunzipSync } from "node:zlib";
import { getStore } from "@netlify/blobs";
import { extractCounts, mergeHistory, buildSnapshot } from "../netlify/lib/egs-data.mjs";

const SITE_URL = "https://www.eurogirlsescort.es/";
const DRY = process.argv.includes("--dry");
const fromArg = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1];
const FROM = fromArg || "20250101";

function log(...a) { console.log(...a); }

async function firecrawlLive() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY missing");
  log("→ Firecrawl live scrape of", SITE_URL);
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: SITE_URL, formats: ["html"], proxy: "stealth",
      location: { country: "US" }, timeout: 90000, waitFor: 4000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status}`);
  const json = await resp.json();
  const html = json?.data?.html ?? json?.data?.rawHtml ?? "";
  if (!html) throw new Error("Firecrawl returned no html");
  return html;
}

async function waybackCaptures() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const cdx =
    `http://web.archive.org/cdx/search/cdx?url=eurogirlsescort.es&output=json` +
    `&from=${FROM}&to=${today}&collapse=timestamp:6&filter=statuscode:200&filter=mimetype:text/html`;
  log("→ Wayback CDX:", cdx);
  const resp = await fetch(cdx, { signal: AbortSignal.timeout(60000) });
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
  // 1. live
  const liveHtml = await firecrawlLive();
  const todayParsed = extractCounts(liveHtml);
  const today = new Date().toISOString().slice(0, 10);
  log(`  live: ${todayParsed.length} countries, ${todayParsed.reduce((s, c) => s + c.total, 0).toLocaleString()} listings (${today})`);
  if (todayParsed.length < 50) throw new Error("live parse too small — aborting");

  // 2. backfill from Wayback
  const history = { series: {} };
  const caps = await waybackCaptures();
  log(`  found ${caps.length} monthly captures`);
  const usedDates = [];
  for (const { ts, original } of caps) {
    const date = tsToDate(ts);
    if (date >= today) continue;
    try {
      const html = await fetchArchived(ts, original);
      const parsed = extractCounts(html);
      if (parsed.length < 50) { log(`    skip ${date}: only ${parsed.length} matches`); continue; }
      mergeHistory(history, parsed, date);
      usedDates.push(date);
      log(`    ${date}: ${parsed.length} countries, ${parsed.reduce((s, c) => s + c.total, 0).toLocaleString()} listings`);
    } catch (e) {
      log(`    skip ${date}: ${e.message}`);
    }
  }

  // 3. merge today's live point last, build snapshot
  mergeHistory(history, todayParsed, today);
  const snapshot = buildSnapshot(todayParsed, history, today);

  // report
  const gb = snapshot.countries.find((c) => c.iso === "gb");
  log(`\n  history depth: ${usedDates.length} backfilled months + today = ${(history.series.gb || []).length} points for GB`);
  log(`  GB: total=${gb?.total} momPrev=${gb?.momPrev} momPct=${gb?.momPct}% window=${gb?.momWindowDays}d`);
  log(`  WORLDWIDE MoM: ${snapshot.totalWorldwideMoMPct}%  (total ${snapshot.totalWorldwide.toLocaleString()})`);

  if (DRY) { log("\n[--dry] not writing blobs"); return; }

  // 4. write to Netlify blob
  const siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) throw new Error("NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN missing");
  const store = getStore({ name: "macro-terminal", siteID, token });
  await store.setJSON("egs/snapshot.json", snapshot);
  await store.setJSON("egs/history.json", history);
  log("\n✓ wrote egs/snapshot.json + egs/history.json to Netlify blob store");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
