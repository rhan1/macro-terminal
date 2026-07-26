// scripts/egs-rates-pilot.mjs
// PILOT: scrape advertised 1-hour escort rates from eurogirlsescort.es via Firecrawl,
// aggregate per-country median USD rates, and write the snapshot/history to Netlify blobs.
//
// Env required: FIRECRAWL_API_KEY, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN
// Run:  node scripts/egs-rates-pilot.mjs [--dry] [--n=18]

import { createHash } from "node:crypto";
import fs from "node:fs";
import * as fsp from "node:fs/promises";
import { getStore } from "@netlify/blobs";

const DEFAULT_N_PROFILES = 18;
const PROFILE_CONCURRENCY = 3;
const CACHE_DIR = "/tmp/egs-rates-cache";
const FX_URL = "https://open.er-api.com/v6/latest/USD";

const PILOT = [
  { iso: "gb", country: "United Kingdom", listUrl: "https://www.eurogirlsescort.es/escorts/reino-unido/" },
  { iso: "de", country: "Germany", listUrl: "https://www.eurogirlsescort.es/escorts/alemania/" },
  { iso: "fr", country: "France", listUrl: "https://www.eurogirlsescort.es/escorts/francia/" },
  { iso: "es", country: "Spain", listUrl: "https://www.eurogirlsescort.es/escorts/espana/" },
  { iso: "it", country: "Italy", listUrl: "https://www.eurogirlsescort.es/escorts/italia/" },
  // NB: the US listing (/escorts/eeuu/) exposes no profiles directly (JS state
  // selector) — pilot uses Switzerland, a well-covered high-rate market, instead.
  { iso: "ch", country: "Switzerland", listUrl: "https://www.eurogirlsescort.es/escorts/suiza/" },
  { iso: "ca", country: "Canada", listUrl: "https://www.eurogirlsescort.es/escorts/canada/" },
  { iso: "br", country: "Brazil", listUrl: "https://www.eurogirlsescort.es/escorts/brasil/" },
  { iso: "au", country: "Australia", listUrl: "https://www.eurogirlsescort.es/escorts/australia/" },
  { iso: "ae", country: "United Arab Emirates", listUrl: "https://www.eurogirlsescort.es/escorts/eau/" },
  { iso: "th", country: "Thailand", listUrl: "https://www.eurogirlsescort.es/escorts/tailandia/" },
  { iso: "nl", country: "Netherlands", listUrl: "https://www.eurogirlsescort.es/escorts/paises-bajos/" },
];

const DRY = process.argv.includes("--dry");
const nArg = (process.argv.find((a) => a.startsWith("--n=")) || "").split("=")[1];
const N_PROFILES = nArg ? Number.parseInt(nArg, 10) : DEFAULT_N_PROFILES;

let firecrawlCalls = 0;
let cacheHits = 0;

function log(...a) { console.log(...a); }

function assertCli() {
  if (!Number.isInteger(N_PROFILES) || N_PROFILES <= 0) {
    throw new Error("--n must be a positive integer");
  }
}

function cacheFileFor(url) {
  const sha = createHash("sha1").update(url).digest("hex");
  return `${CACHE_DIR}/${sha}.json`;
}

async function fetchFxRates() {
  const resp = await fetch(FX_URL, { signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`FX HTTP ${resp.status}`);
  const json = await resp.json();
  const rates = json?.rates;
  if (!rates || typeof rates !== "object") throw new Error("FX response missing rates");
  return { ...rates, USD: 1 };
}

async function firecrawlScrape(url, formats) {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = cacheFileFor(url);

  if (fs.existsSync(cacheFile)) {
    cacheHits += 1;
    return JSON.parse(await fsp.readFile(cacheFile, "utf8"));
  }

  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY missing");

  firecrawlCalls += 1;
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url, formats, proxy: "stealth",
      location: { country: "US" }, timeout: 90000, waitFor: 4000,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) throw new Error(`Firecrawl HTTP ${resp.status} for ${url}`);
  const json = await resp.json();
  await fsp.writeFile(cacheFile, JSON.stringify(json, null, 2), "utf8");
  return json;
}

function htmlFromFirecrawl(json) {
  return json?.data?.html ?? json?.data?.rawHtml ?? "";
}

function markdownFromFirecrawl(json) {
  return json?.data?.markdown ?? "";
}

function extractProfileUrls(html) {
  const urls = [];
  const seen = new Set();
  const re = /href="(https:\/\/www\.eurogirlsescort\.es\/escort\/[^"]+)"/g;
  let match;

  while ((match = re.exec(html)) !== null) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

function tableCells(line) {
  const parts = line.split("|");
  if (parts[0]?.trim() === "") parts.shift();
  if (parts[parts.length - 1]?.trim() === "") parts.pop();
  return parts.map((p) => p.trim());
}

function firstCurrencyAmount(cell) {
  const match = /(\d[\d,]*)\s*([A-Z]{3})/.exec(cell ?? "");
  if (!match) return null;
  return {
    amount: Number.parseInt(match[1].replaceAll(",", ""), 10),
    cur: match[2],
  };
}

function parseOneHourRates(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Tarifas");
  if (start === -1) return { incall: null, outcall: null };

  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) break;
    if (!trimmed.includes("|")) continue;

    const [time, incall, outcall] = tableCells(trimmed);
    const timeMatch = /(\d+)\s*Hora/i.exec(time ?? "");
    if (!timeMatch || Number.parseInt(timeMatch[1], 10) !== 1) continue;

    return {
      incall: firstCurrencyAmount(incall),
      outcall: firstCurrencyAmount(outcall),
    };
  }

  return { incall: null, outcall: null };
}

function toUsd(rate, rates) {
  if (!rate) return null;
  const fx = rate.cur === "USD" ? 1 : rates[rate.cur];
  if (!Number.isFinite(fx) || fx <= 0) return null;
  return rate.amount / fx;
}

async function profileSignal(url, rates) {
  const json = await firecrawlScrape(url, ["markdown"]);
  const markdown = markdownFromFirecrawl(json);
  if (!markdown) throw new Error("Firecrawl returned no markdown");

  const parsed = parseOneHourRates(markdown);
  const incallUsd = toUsd(parsed.incall, rates);
  if (incallUsd !== null) {
    return { usd: incallUsd, cur: parsed.incall.cur, metric: "incall" };
  }

  const outcallUsd = toUsd(parsed.outcall, rates);
  if (outcallUsd !== null) {
    return { usd: outcallUsd, cur: parsed.outcall.cur, metric: "outcall" };
  }

  return null;
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function bump(mix, key) {
  mix[key] = (mix[key] ?? 0) + 1;
}

function medianInt(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median);
}

async function scrapeCountry(country, rates) {
  log(`→ ${country.iso} ${country.country}: scraping list`);
  const listJson = await firecrawlScrape(country.listUrl, ["html"]);
  const html = htmlFromFirecrawl(listJson);
  if (!html) throw new Error(`Firecrawl returned no html for ${country.listUrl}`);

  const profileUrls = extractProfileUrls(html).slice(0, N_PROFILES);
  log(`  found ${profileUrls.length} profile URLs`);

  const signals = await mapPool(profileUrls, PROFILE_CONCURRENCY, async (url) => {
    try {
      return await profileSignal(url, rates);
    } catch (e) {
      log(`    skip profile: ${e.message}`);
      return null;
    }
  });

  const values = [];
  const currencyMix = {};
  const metricMix = { incall: 0, outcall: 0 };

  for (const signal of signals) {
    if (!signal) continue;
    values.push(signal.usd);
    bump(currencyMix, signal.cur);
    bump(metricMix, signal.metric);
  }

  return {
    iso: country.iso,
    country: country.country,
    medianIncallUsd: medianInt(values),
    sampleSize: values.length,
    currencyMix,
    metricMix,
  };
}

function topCurrency(currencyMix) {
  const entries = Object.entries(currencyMix);
  if (entries.length === 0) return "n/a";
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [cur, count] = entries[0];
  return `${cur} (${count})`;
}

function metricSplit(metricMix) {
  return `incall:${metricMix.incall ?? 0} outcall:${metricMix.outcall ?? 0}`;
}

function printSummary(snapshot) {
  const headers = ["iso", "country", "median USD", "sample", "top currency", "metric split"];
  const rows = snapshot.countries.map((c) => [
    c.iso,
    c.country,
    c.medianIncallUsd === null ? "n/a" : `$${c.medianIncallUsd}`,
    String(c.sampleSize),
    topCurrency(c.currencyMix),
    metricSplit(c.metricMix),
  ]);

  const widths = headers.map((header, i) => Math.max(
    header.length,
    ...rows.map((row) => row[i].length),
  ));
  const format = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join(" | ");

  log("");
  log(format(headers));
  log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) log(format(row));
  log(`\nFirecrawl calls: ${firecrawlCalls} (cache hits: ${cacheHits})`);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function mergeRatesHistory(history, countries, date) {
  if (!history.series || typeof history.series !== "object") history.series = {};

  for (const country of countries) {
    if (!Number.isFinite(country.medianIncallUsd)) continue;

    const existing = Array.isArray(history.series[country.iso])
      ? history.series[country.iso]
      : [];
    const next = existing.filter((point) => point?.date !== date);
    next.push({ date, medianUsd: country.medianIncallUsd });
    next.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    history.series[country.iso] = next;
  }

  return history;
}

async function writeBlobs(snapshot) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) throw new Error("NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN missing");

  const store = getStore({ name: "macro-terminal", siteID, token });
  await store.setJSON("egs/rates-snapshot.json", snapshot);

  const hist = (await store.get("egs/rates-history.json", { type: "json" })) ?? { series: {} };
  mergeRatesHistory(hist, snapshot.countries, todayIsoDate());
  await store.setJSON("egs/rates-history.json", hist);
}

async function main() {
  assertCli();

  log("→ fetching USD FX rates");
  const rates = await fetchFxRates();

  const countries = [];
  for (const country of PILOT) {
    try {
      countries.push(await scrapeCountry(country, rates));
    } catch (e) {
      log(`  skip country ${country.iso}: ${e.message}`);
      countries.push({
        iso: country.iso,
        country: country.country,
        medianIncallUsd: null,
        sampleSize: 0,
        currencyMix: {},
        metricMix: { incall: 0, outcall: 0 },
      });
    }
  }

  const snapshot = {
    source: "eurogirlsescort.es",
    pilot: true,
    fetchedAt: new Date().toISOString(),
    nProfilesPerCountry: N_PROFILES,
    countries,
  };

  if (DRY) {
    log("\n[--dry] not writing blobs");
  } else {
    await writeBlobs(snapshot);
    log("\n✓ wrote egs/rates-snapshot.json + egs/rates-history.json to Netlify blob store");
  }

  printSummary(snapshot);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
