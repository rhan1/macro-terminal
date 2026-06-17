// IPO Calendar API
// Sources:
//   1. Nasdaq IPO calendar JSON (current + next month, parallel)
//   2. SEC EDGAR submissions (sector enrichment via sicDescription)
//
// Response contract (matches src/tabs/IPO.jsx):
//   { ipos: [...], pipeline: [...], source, fetchedAt, count }
//   Each IPO: { company, ticker, status, expectedTradeDate, priceRange,
//               sharesMil, estVolumeMil, sector }
//   pipeline: filed-only rows (no pricing date yet)

import { getJSON, putJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_CACHE_KEY = "ipo/calendar.json";

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

    // 4. SEC enrichment — fetch ticker→CIK map once, enrich in parallel
    try {
      const tickerCikMap = await buildTickerCikMap();
      await Promise.allSettled([
        enrichWithSec(ipos, tickerCikMap),
        enrichWithSec(pipeline, tickerCikMap),
      ]);
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
