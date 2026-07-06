// IPO Calendar API
// Sources:
//   1. Nasdaq IPO calendar JSON (current + next month, parallel)
//   2. SEC EDGAR submissions (sector enrichment via sicDescription), tiered:
//      a) ticker -> company_tickers.json -> CIK -> sicDescription (fast path;
//         empty for freshly-filed IPOs whose ticker isn't SEC-registered yet)
//      b) EDGAR full-text-search fallback: company name -> S-1/F-1 filing ->
//         CIK -> sicDescription, backed by a 7-day blob cache. This is what
//         covers the bulk of the `pipeline` (filed-only) rows, since those
//         tickers essentially never exist in company_tickers.json yet.
//
// Response contract (matches src/tabs/IPO.jsx):
//   { ipos: [...], pipeline: [...], source, fetchedAt, count }
//   Each IPO: { company, ticker, status, expectedTradeDate, priceRange,
//               sharesMil, estVolumeMil, sector }
//   pipeline: filed-only rows (no pricing date yet)

import { getJSON, putJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_CACHE_KEY = "ipo/calendar.json";
const SECTOR_CACHE_KEY = "ipo/sector-cache.json";
const SECTOR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — SIC rarely changes; re-tries blank-check SPACs weekly

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SEC_UA = "macro-terminal/1.0 (raza.khan@locallabs.com)";

// ── helpers ────────────────────────────────────────────────────────────────

/** Parse "M/D/YYYY" or "M/DD/YYYY" from Nasdaq into the same format IPO.jsx's
 *  formatDate() expects ("M/D/YYYY" split on "/"). */
function normalizeDate(raw) {
  if (!raw) return null;
  // Nasdaq uses "4/15/2026" or "5/05/2026" — both fine as-is
  return raw.trim() || null;
}

/** Parse a shares string like "17,500,000" → float millions (17.5). */
function parseSharesToMil(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  if (isNaN(n)) return null;
  return n / 1_000_000;
}

/** Parse dollar volume string "$175,000,000" → float millions (175). */
function parseDollarToMil(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,]/g, ""));
  if (isNaN(n)) return null;
  return n / 1_000_000;
}

/** Nasdaq price field can be "10.00" or "4.00-6.00".
 *  Normalise to "$lo - $hi" or "$price". */
function normalizePriceRange(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("-")) {
    const [lo, hi] = s.split("-").map((p) => p.trim());
    const loN = parseFloat(lo);
    const hiN = parseFloat(hi);
    if (!isNaN(loN) && !isNaN(hiN)) {
      return `$${loN.toFixed(2)} - $${hiN.toFixed(2)}`;
    }
  }
  const n = parseFloat(s);
  if (!isNaN(n)) return `$${n.toFixed(2)}`;
  return s;
}

/** Map Nasdaq dealStatus or section to IPO.jsx status values.
 *  IPO.jsx checks: status?.toLowerCase() === "priced" | "withdrawn" | "postponed" */
function mapStatus(dealStatus, section) {
  if (dealStatus) {
    const s = dealStatus.toLowerCase();
    if (s === "priced") return "Priced";
    if (s.includes("withdraw")) return "Withdrawn";
    if (s.includes("postpon")) return "Postponed";
    return dealStatus; // pass through (WEEK OF, day names, etc.)
  }
  if (section === "priced") return "Priced";
  return null; // upcoming → null → statusLabel shows "UPCOMING"
}

// ── Nasdaq fetch (with retry + backoff) ────────────────────────────────────

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SEC EDGAR request pacing ────────────────────────────────────────────────
// SEC's fair-use guidance caps automated access at ~10 req/s across
// *.sec.gov. All calls below (company_tickers.json, data.sec.gov submissions,
// efts.sec.gov full-text-search) funnel through this single module-level
// pacer so the ceiling holds even though callers dispatch concurrently via
// Promise.allSettled. The read-then-update of `lastSecDispatchAt` happens
// synchronously (no await in between), so concurrent callers can't race it.
let lastSecDispatchAt = 0;
const SEC_MIN_GAP_MS = 110; // ~9 req/s dispatch pacing — safely under the 10 req/s ceiling

function paceSecRequest() {
  const now = Date.now();
  const scheduledAt = Math.max(now, lastSecDispatchAt + SEC_MIN_GAP_MS);
  lastSecDispatchAt = scheduledAt;
  const wait = scheduledAt - now;
  return wait > 0 ? sleep(wait) : Promise.resolve();
}

/**
 * Fetch one Nasdaq IPO calendar month with up to `maxAttempts` retries.
 * Backoff: 1s → 2s → 4s (exponential, capped).
 */
async function fetchNasdaqMonth(yearMonth, maxAttempts = 3) {
  const url = `https://api.nasdaq.com/api/ipo/calendar?date=${yearMonth}`;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s, …
    }
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": NASDAQ_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.nasdaq.com/",
          "Sec-Fetch-Site": "same-site",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        lastErr = new Error(`Nasdaq ${yearMonth} HTTP ${resp.status}`);
        // 403/429 → retry; 404 → no point retrying
        if (resp.status === 404) throw lastErr;
        continue;
      }
      const json = await resp.json();
      return json?.data ?? {};
    } catch (err) {
      lastErr = err;
      // AbortError (timeout) → retry
    }
  }
  throw lastErr ?? new Error(`Nasdaq ${yearMonth} failed after ${maxAttempts} attempts`);
}

/** Extract rows from a section object, handling both `rows` and
 *  `upcomingTable.rows` shapes, and null rows. */
function extractRows(sectionObj) {
  if (!sectionObj || typeof sectionObj !== "object") return [];
  const direct = sectionObj.rows;
  if (Array.isArray(direct)) return direct;
  const nested = sectionObj?.upcomingTable?.rows;
  if (Array.isArray(nested)) return nested;
  return [];
}

/** Convert a Nasdaq priced/upcoming row → IPO record */
function rowToIpo(row, section) {
  const dateRaw =
    section === "priced" ? row.pricedDate : row.expectedPriceDate;

  return {
    company: row.companyName || null,
    ticker: row.proposedTickerSymbol || null,
    status: mapStatus(row.dealStatus, section),
    expectedTradeDate: normalizeDate(dateRaw),
    priceRange: normalizePriceRange(row.proposedSharePrice),
    sharesMil: parseSharesToMil(row.sharesOffered),
    estVolumeMil: parseDollarToMil(row.dollarValueOfSharesOffered),
    sector: null, // enriched below
    _dealID: row.dealID || null, // internal, for dedup
  };
}

/** Convert a Nasdaq filed row → pipeline record */
function rowToPipeline(row) {
  return {
    company: row.companyName || null,
    ticker: row.proposedTickerSymbol || null,
    filedDate: normalizeDate(row.filedDate),
    estVolumeMil: parseDollarToMil(row.dollarValueOfSharesOffered),
    sector: null,
    _dealID: row.dealID || null,
  };
}

// ── SEC EDGAR sector enrichment ─────────────────────────────────────────────

async function buildTickerCikMap() {
  await paceSecRequest();
  const resp = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`company_tickers HTTP ${resp.status}`);
  const raw = await resp.json();
  // Shape: { "0": { cik_str, ticker, title }, "1": {...}, ... }
  const map = {};
  for (const entry of Object.values(raw)) {
    if (entry.ticker && entry.cik_str != null) {
      map[entry.ticker.toUpperCase()] = String(entry.cik_str);
    }
  }
  return map;
}

async function fetchSicDescription(cik) {
  const padded = String(cik).padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  await paceSecRequest();
  const resp = await fetch(url, {
    headers: { "User-Agent": SEC_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.sicDescription || null;
}

/** Enrich an array of IPO/pipeline records with SEC sicDescription.
 *  Mutates each record's `.sector` in place. Failures are silently skipped. */
async function enrichWithSec(records, tickerCikMap) {
  await Promise.allSettled(
    records.map(async (rec) => {
      const ticker = rec.ticker?.toUpperCase();
      if (!ticker) return;
      const cik = tickerCikMap[ticker];
      if (!cik) return;
      const sic = await fetchSicDescription(cik).catch(() => null);
      if (sic) rec.sector = sic;
    })
  );
}

// ── SEC EDGAR full-text-search fallback ─────────────────────────────────────
// Freshly-filed IPOs (esp. `pipeline` rows) almost never have a ticker in
// company_tickers.json yet — that file only fills in once the S-1 clears and
// the exchange listing is finalized. But the S-1/F-1 itself is on EDGAR the
// day it's filed, so we can find the CIK by searching for the company name
// in EDGAR's full-text-search index instead of by ticker.

const EFTS_FORMS = ["S-1", "F-1"]; // F-1 covers foreign private issuers (no ticker/US-domestic S-1)

/** Look up a CIK via EDGAR full-text search by exact company-name phrase.
 *  Tries S-1 first (US domestic), then F-1 (foreign private issuer). */
async function fetchCikViaFullTextSearch(companyName) {
  if (!companyName) return null;
  const q = encodeURIComponent(`"${companyName.trim()}"`);
  for (const forms of EFTS_FORMS) {
    await paceSecRequest();
    try {
      const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=${forms}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": SEC_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const cik = json?.hits?.hits?.[0]?._source?.ciks?.[0];
      if (cik) return String(cik);
    } catch {
      // try the next form
    }
  }
  return null;
}

function normalizeCompanyKey(name) {
  return (name || "").trim().toLowerCase();
}

/** Load the company-name -> { sector, cik, resolvedAt } blob cache.
 *  Returns {} on any failure (cold start / first run / corrupt blob). */
async function loadSectorCache() {
  const cached = await getJSON(SECTOR_CACHE_KEY).catch(() => null);
  return cached && typeof cached === "object" ? cached : {};
}

/** Fallback enrichment for records `enrichWithSec` couldn't resolve (no
 *  ticker hit in company_tickers.json). For each still-unsectored record:
 *    1. Check the blob cache (by normalized company name) — skip EDGAR
 *       entirely on a fresh hit, positive or negative, within the TTL.
 *    2. Otherwise hit EDGAR full-text-search -> CIK -> sicDescription,
 *       and record the outcome (even a miss) in the cache so we don't
 *       re-query every 15-minute CDN cache revalidation.
 *  Mutates each record's `.sector` in place and the cache object in place.
 *  Returns true if the cache object was mutated (caller should persist it). */
async function enrichWithSecFullTextSearch(records, sectorCache) {
  const now = Date.now();
  let cacheDirty = false;

  await Promise.allSettled(
    records.map(async (rec) => {
      if (rec.sector) return; // already resolved via the ticker fast path
      const key = normalizeCompanyKey(rec.company);
      if (!key) return;

      const cached = sectorCache[key];
      if (cached && now - Date.parse(cached.resolvedAt || 0) < SECTOR_CACHE_TTL_MS) {
        if (cached.sector) rec.sector = cached.sector;
        return; // fresh cache entry (hit or miss) — don't re-query EDGAR
      }

      const cik = await fetchCikViaFullTextSearch(rec.company).catch(() => null);
      const sic = cik ? await fetchSicDescription(cik).catch(() => null) : null;

      sectorCache[key] = {
        sector: sic || null,
        cik: cik || null,
        resolvedAt: new Date().toISOString(),
      };
      cacheDirty = true;
      if (sic) rec.sector = sic;
    })
  );

  return cacheDirty;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");

  try {
    // 1. Determine current + next month (YYYY-MM)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

    // 2. Fetch both months in parallel (each retries up to 3× internally)
    const [curResult, nxtResult] = await Promise.allSettled([
      fetchNasdaqMonth(currentMonth),
      fetchNasdaqMonth(nextMonth),
    ]);

    const datasets = [];
    if (curResult.status === "fulfilled") datasets.push(curResult.value);
    if (nxtResult.status === "fulfilled") datasets.push(nxtResult.value);

    if (datasets.length === 0) {
      // All Nasdaq fetches failed — try to serve last good result from blob cache
      const cached = await getJSON(BLOB_CACHE_KEY).catch(() => null);
      if (cached?.ipos?.length > 0) {
        return res.status(200).json({
          ...cached,
          stale: true,
          source: cached.source ?? "nasdaq.com (cached)",
        });
      }
      const errs = [curResult, nxtResult]
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message)
        .join("; ");
      return res.status(200).json({
        error: `All Nasdaq fetches failed: ${errs}`,
        ipos: [],
        pipeline: [],
        source: "nasdaq.com",
        fetchedAt: new Date().toISOString(),
      });
    }

    // 3. Merge rows across months, deduplicate by dealID
    const seenDealIds = new Set();
    const ipos = [];
    const pipeline = [];

    for (const data of datasets) {
      // Priced
      for (const row of extractRows(data.priced)) {
        if (seenDealIds.has(row.dealID)) continue;
        seenDealIds.add(row.dealID);
        ipos.push(rowToIpo(row, "priced"));
      }
      // Upcoming
      for (const row of extractRows(data.upcoming)) {
        if (seenDealIds.has(row.dealID)) continue;
        seenDealIds.add(row.dealID);
        ipos.push(rowToIpo(row, "upcoming"));
      }
      // Filed → pipeline only
      for (const row of extractRows(data.filed)) {
        if (seenDealIds.has(row.dealID)) continue;
        seenDealIds.add(row.dealID);
        pipeline.push(rowToPipeline(row));
      }
    }

    // 4. SEC enrichment — tiered, both stages best-effort:
    //    a) ticker → company_tickers.json → CIK → sicDescription (fast path)
    try {
      const tickerCikMap = await buildTickerCikMap();
      await Promise.allSettled([
        enrichWithSec(ipos, tickerCikMap),
        enrichWithSec(pipeline, tickerCikMap),
      ]);
    } catch {
      // Ticker fast path is best-effort; fall through to full-text search
      // for everything (it doesn't depend on the ticker map).
    }

    //    b) EDGAR full-text-search fallback for anything (a) missed — this is
    //       what covers freshly-filed IPOs whose ticker isn't SEC-registered
    //       yet. Backed by a 7-day blob cache (see enrichWithSecFullTextSearch).
    try {
      const sectorCache = await loadSectorCache();
      const [dirty1, dirty2] = await Promise.all([
        enrichWithSecFullTextSearch(ipos, sectorCache),
        enrichWithSecFullTextSearch(pipeline, sectorCache),
      ]);
      if (dirty1 || dirty2) {
        putJSON(SECTOR_CACHE_KEY, sectorCache).catch(() => {});
      }
    } catch {
      // Sector enrichment is best-effort; failures leave sector: null
    }

    // 5. Strip internal _dealID before sending
    const cleanIpos = ipos.map(({ _dealID, ...rest }) => rest);
    const cleanPipeline = pipeline.map(({ _dealID, ...rest }) => rest);

    const payload = {
      source: "nasdaq.com + sec.gov",
      fetchedAt: new Date().toISOString(),
      count: cleanIpos.length,
      ipos: cleanIpos,
      pipeline: cleanPipeline,
    };

    // 6. Persist to blob cache on success (best-effort, don't block response)
    putJSON(BLOB_CACHE_KEY, payload).catch(() => {});

    return res.status(200).json(payload);
  } catch (err) {
    // Unexpected top-level error — try blob cache before returning empty
    const cached = await getJSON(BLOB_CACHE_KEY).catch(() => null);
    if (cached?.ipos?.length > 0) {
      return res.status(200).json({
        ...cached,
        stale: true,
        source: cached.source ?? "nasdaq.com (cached)",
      });
    }
    return res.status(200).json({
      error: err.message,
      ipos: [],
      pipeline: [],
      source: "nasdaq.com",
      fetchedAt: new Date().toISOString(),
    });
  }
}
