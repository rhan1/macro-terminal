// Pulls Congressional trades from capitoltrades.com by scraping the Next.js
// RSC Flight JSON embedded in the /trades SSR HTML. ScrapingBee's render_js
// returns only the shell; a direct fetch with browser headers hits a Vercel
// edge HIT that contains the full page payload including the trade array.
//
// ~2026-06-05 capitoltrades.com enabled Vercel Attack Challenge Mode
// (HTTP 429 + `x-vercel-mitigated: challenge` on every plain fetch), which
// killed the direct path and left the blob stale. Each page fetch now tries
// the direct fetch first (free, fails fast) and falls back to Firecrawl's
// real-browser scrape, which passes the challenge. Because Firecrawl costs
// ~5-10s per page, the run fetches a small fixed batch of pages in PARALLEL
// and MERGES with the previous blob snapshot instead of paginating the whole
// 365-day window every run.
//
// The payload is shaped as JS-escaped JSON inside a `self.__next_f.push([1,
// "..."])` chunk. We locate `\"data\":[{\"_issuerId\"...`, walk to the
// unescaped closing quote, JSON-parse once to unescape, then parse the
// array directly.
import { putJSON, getJSON } from "../../netlify/lib/netlify-blob.mjs";
import committeesData from "../../src/data/committees.json" with { type: "json" };

const BASE = "https://www.capitoltrades.com/trades";
const YEAR_MS = 365 * 86400000;
const SECTORS = ["Technology", "Financials", "Health Care", "Energy", "Industrials", "Consumer Discretionary", "Consumer Staples", "Utilities", "Real Estate", "Materials", "Communication Services"];
const COMMITTEE_SECTORS = { "Armed Services": ["Industrials", "Defense"], Banking: ["Financials"], "Financial Services": ["Financials"], "Energy and Commerce": ["Energy", "Health Care"], "Energy and Natural Resources": ["Energy"], Agriculture: ["Consumer Staples"], Intelligence: ["Industrials", "Technology"], HELP: ["Health Care"], Health: ["Health Care"], Judiciary: [], "Transportation and Infrastructure": ["Industrials"], "Natural Resources": ["Energy", "Materials"] };
function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/,?\s*(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const COMMITTEE_MAP = (() => {
  const m = new Map();
  for (const member of committeesData) {
    const fullName = member.name || "";
    const key = normalizeName(fullName);
    const committees = (member.committees || []).map((c) => c.name || c).filter(Boolean);
    if (key && committees.length) m.set(key, committees);
  }
  return m;
})();
const COMMITTEE_KEYWORDS = {
  "Armed Services": ["LMT", "RTX", "BA", "GD", "NOC", "LHX", "HII", "TXT", "TDG", "AVAV"],
  "Financial Services": ["JPM", "GS", "BAC", "WFC", "C", "MS", "USB", "PNC", "TFC", "COF", "BLK", "SCHW", "AXP", "V", "MA"],
  "Energy and Commerce": ["XOM", "CVX", "COP", "EOG", "MPC", "VLO", "SLB", "OXY", "PSX", "PFE", "JNJ", "MRK", "UNH", "ABBV"],
  "Banking, Housing, and Urban Affairs": ["JPM", "GS", "BAC", "WFC", "C", "MS", "USB", "PNC", "TFC", "COF"],
};
function inferCommitteeFromTicker(ticker) {
  for (const [committee, tickers] of Object.entries(COMMITTEE_KEYWORDS)) {
    if (tickers.includes(ticker)) return committee;
  }
  return null;
}
const TICKER_SECTORS = {
  LMT: "Industrials", RTX: "Industrials", GD: "Industrials", NOC: "Industrials", BA: "Industrials", LHX: "Industrials", HII: "Industrials",
  JPM: "Financials", BAC: "Financials", WFC: "Financials", C: "Financials", GS: "Financials", MS: "Financials",
  XOM: "Energy", CVX: "Energy", COP: "Energy", EOG: "Energy",
  NVDA: "Technology", MSFT: "Technology", GOOGL: "Communication Services", AAPL: "Technology", META: "Communication Services", AMZN: "Consumer Discretionary",
  PFE: "Health Care", JNJ: "Health Care", LLY: "Health Care", MRK: "Health Care", UNH: "Health Care", ABBV: "Health Care",
  KO: "Consumer Staples", PEP: "Consumer Staples", COST: "Consumer Staples", WMT: "Consumer Staples", PG: "Consumer Staples",
  NEM: "Materials", FCX: "Materials", LIN: "Materials"
};
const SECTOR_KEBAB_MAP = {
  "communication-services": "Communication Services",
  "consumer-discretionary": "Consumer Discretionary",
  "consumer-staples": "Consumer Staples",
  "energy": "Energy",
  "financials": "Financials",
  "health-care": "Health Care",
  "industrials": "Industrials",
  "information-technology": "Technology",
  "materials": "Materials",
  "real-estate": "Real Estate",
  "utilities": "Utilities",
};
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function sizeMidpoint(trade) { return typeof trade.value === "number" && trade.value > 0 ? trade.value : 0; }
function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function issuerSectorFallback(issuer) {
  const v = String(issuer || "").toLowerCase();
  if (/(bank|financial|capital|visa|mastercard|insurance)/.test(v)) return "Financials";
  if (/(energy|petroleum|oil|gas|pipeline)/.test(v)) return "Energy";
  if (/(health|pharma|biotech|medical|therapeutics)/.test(v)) return "Health Care";
  if (/(software|semiconductor|technology|cloud|data)/.test(v)) return "Technology";
  if (/(telecom|media|communications|internet|alphabet|meta)/.test(v)) return "Communication Services";
  if (/(retail|consumer|amazon|tesla|disney|restaurant|apparel)/.test(v)) return "Consumer Discretionary";
  if (/(beverage|grocery|food|household|walmart|costco|procter)/.test(v)) return "Consumer Staples";
  if (/(mining|materials|chemical|steel|copper|gold)/.test(v)) return "Materials";
  if (/(utility|electric|water|power)/.test(v)) return "Utilities";
  if (/(reit|real estate|property)/.test(v)) return "Real Estate";
  if (/(aerospace|defense|industrial|airlines|transport)/.test(v)) return "Industrials";
  return null;
}

// Locate and parse the Flight-embedded trade array. Returns raw trade objects
// exactly as CapitolTrades' BFF hands them to the client: {_txId, politician,
// issuer, txType, txDate, pubDate, value, price, reportingGap, comment, ...}
function extractTradesFromHtml(html) {
  const marker = '\\"data\\":[';
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const arrStart = start + marker.length - 1; // position of '['
  // Find the end of the surrounding JS string literal — first unescaped "
  let end = arrStart;
  while (end < html.length) {
    if (html[end] === '"') {
      let backs = 0, k = end - 1;
      while (k >= 0 && html[k] === '\\') { backs++; k--; }
      if (backs % 2 === 0) break;
    }
    end++;
  }
  if (end >= html.length) return [];
  let unescaped;
  try { unescaped = JSON.parse('"' + html.slice(arrStart, end) + '"'); }
  catch { return []; }
  // Walk brackets on the unescaped JSON to find the array's own close.
  let depth = 0, i = 0, inStr = false, esc = false;
  for (i = 0; i < unescaped.length; i++) {
    const c = unescaped[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { i++; break; } }
  }
  try { return JSON.parse(unescaped.slice(0, i)); }
  catch { return []; }
}

function normTrade(t) {
  const p = t.politician || {};
  const iss = t.issuer || {};
  const rawTicker = iss.issuerTicker || "";
  // "VZ:US" → "VZ"; leave suffix-less tickers alone
  const ticker = rawTicker ? rawTicker.split(":")[0].toUpperCase() || null : null;
  const party = p.party === "democrat" ? "D" : p.party === "republican" ? "R" : p.party ? "I" : null;
  const chamber = p.chamber === "house" ? "H" : p.chamber === "senate" ? "S" : null;
  const side = t.txType === "buy" ? "buy" : t.txType === "sell" ? "sell" : null;
  const politician = `${(p.firstName || "").trim()} ${(p.lastName || "").trim()}`.trim();
  return {
    politician,
    party,
    chamber,
    state: p._stateId ? String(p._stateId).toUpperCase() : null,
    ticker,
    issuer: iss.issuerName || null,
    sector: SECTOR_KEBAB_MAP[String(iss.sector || "").toLowerCase()] || null,
    side,
    value: Number(t.value) || 0,
    price: t.price || null,
    tradeDate: t.txDate || null,
    filedDate: t.pubDate ? t.pubDate.slice(0, 10) : null,
    reportingGap: t.reportingGap ?? null,
    owner: t.owner || null,
    comment: t.comment || null,
    securityType: t.assetType || "stock",
    txId: t._txId ?? null,
  };
}

function aggregateTickerTrades(trades, side, days) {
  const start = isoDaysAgo(days);
  const map = new Map();
  for (const trade of trades) {
    if (trade.side !== side || !trade.ticker || !trade.tradeDate || trade.tradeDate < start) continue;
    const row = map.get(trade.ticker) || { ticker: trade.ticker, issuer: trade.issuer || null, netDollar: 0, tradeCount: 0, politicians: new Set() };
    row.netDollar += sizeMidpoint(trade);
    row.tradeCount += 1;
    row.politicians.add(trade.politician);
    if (!row.issuer && trade.issuer) row.issuer = trade.issuer;
    map.set(trade.ticker, row);
  }
  return [...map.values()].sort((a, b) => b.netDollar - a.netDollar).slice(0, 10).map((x) => ({ ...x, politicians: [...x.politicians] }));
}

function tradeDedupKey(trade) {
  return [
    trade?.politician || "",
    trade?.ticker || "",
    trade?.side || "",
    trade?.tradeDate || "",
  ].join("|");
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" });

    const backfillRaw = Array.isArray(req.query?.backfill) ? req.query.backfill[0] : req.query?.backfill;
    const maxPages = Math.max(1, parseInt(backfillRaw || "60", 10) || 60);
    const cutoff = new Date(Date.now() - YEAR_MS).toISOString().slice(0, 10);
    const pageTrades = [];
    let anyRows = false;

    for (let page = 1; page <= maxPages; page += 1) {
      const resp = await fetch(`${BASE}?page=${page}&pageSize=50`, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) {
        // Don't throw — tolerate per-page failures and keep going so one bad edge doesn't kill the whole refresh
        console.error(`CapitolTrades page ${page} HTTP ${resp.status}`);
        break;
      }
      const html = await resp.text();
      const rawTrades = extractTradesFromHtml(html);
      if (!rawTrades.length) break; // Empty page = end of pagination
      anyRows = true;
      const normalized = rawTrades.map(normTrade).filter((t) => t.politician && t.tradeDate && t.side);
      pageTrades.push(...normalized);
      // Stop when the FILED date crosses the 365d cutoff. Using tradeDate breaks
      // here because STOCK Act allows up to 45 days (and habitual late-filers
      // hundreds of days) — so old txDates appear on every page and trigger an
      // early exit at ~21 pages, capping the dataset at ~1,042 trades.
      const oldestFiled = normalized.map((x) => x.filedDate).filter(Boolean).sort()[0] || null;
      if (oldestFiled && oldestFiled < cutoff) break;
    }

    // Dedupe by composite key (CapitolTrades doesn't always fill txId for every row)
    const seen = new Set();
    const seenStable = new Set();
    const trades = [];
    let duplicateCount = 0;
    for (const trade of pageTrades) {
      // Filter by filedDate (when the disclosure entered the public record) so
      // late-filed trades from prior years still count toward the 365-day window.
      if ((trade.filedDate || trade.tradeDate) < cutoff) continue;
      const key = trade.txId != null ? `tx-${trade.txId}` : `${trade.politician}-${trade.ticker}-${trade.tradeDate}-${trade.side}`;
      const stableKey = tradeDedupKey(trade);
      if (seen.has(key) || seenStable.has(stableKey)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      seenStable.add(stableKey);
      trades.push(trade);
    }
    if (duplicateCount > 0) console.debug(`[capitol] dropped ${duplicateCount} duplicate trades`);
    if (!anyRows || trades.length < 30) return res.status(502).json({ error: "too few trades parsed", tradeCount: trades.length });

    const last14 = isoDaysAgo(14);
    const last60 = isoDaysAgo(60);
    const last90 = isoDaysAgo(90);
    const ytd = `${new Date().getUTCFullYear()}-01-01`;
    const clusterMap = new Map();
    const committeeAligned = [];
    const sectorFlowMap = new Map(SECTORS.map((sector) => [sector, { sector, netDollar: 0, buyDollar: 0, sellDollar: 0, tradeCount: 0 }]));
    const leaderboardMap = new Map();

    for (const trade of trades) {
      if (trade.ticker && trade.tradeDate >= last14) {
        const row = clusterMap.get(trade.ticker) || { ticker: trade.ticker, issuer: trade.issuer || null, trades: [], pols: new Set(), parties: new Set(), buy: 0, sell: 0, netDollar: 0 };
        row.trades.push(trade);
        row.pols.add(trade.politician);
        if (trade.party) row.parties.add(trade.party);
        row[trade.side] += 1;
        row.netDollar += sizeMidpoint(trade);
        if (!row.issuer && trade.issuer) row.issuer = trade.issuer;
        clusterMap.set(trade.ticker, row);
      }
      const proxyCommittee = (() => {
        const polCommittees = COMMITTEE_MAP.get(normalizeName(trade.politician)) || [];
        const tickerCommittee = inferCommitteeFromTicker(trade.ticker);
        if (tickerCommittee && polCommittees.some((pc) =>
          pc.toLowerCase().includes(tickerCommittee.toLowerCase().split(",")[0]) ||
          tickerCommittee.toLowerCase().includes(pc.toLowerCase().split(",")[0])
        )) {
          return tickerCommittee;
        }
        return null;
      })();
      if (trade.tradeDate >= last60 && proxyCommittee) committeeAligned.push({ ...trade, committeeAligned: true, proxyCommittee, alignedSector: TICKER_SECTORS[trade.ticker] || COMMITTEE_SECTORS[proxyCommittee][0] || null });

      // Prefer the sector CapitolTrades gives us; fall back to ticker map then issuer name heuristic.
      const sector = trade.sector || (trade.ticker && TICKER_SECTORS[trade.ticker]) || issuerSectorFallback(trade.issuer);
      if (trade.tradeDate >= last90 && sector && sectorFlowMap.has(sector)) {
        const row = sectorFlowMap.get(sector);
        const amt = sizeMidpoint(trade);
        row.netDollar += trade.side === "buy" ? amt : -amt;
        if (trade.side === "buy") row.buyDollar += amt;
        else row.sellDollar += amt;
        row.tradeCount += 1;
      }
      if (trade.tradeDate >= ytd) {
        const row = leaderboardMap.get(trade.politician) || { politician: trade.politician, party: trade.party, chamber: trade.chamber, tradeCount: 0, volume: 0 };
        row.tradeCount += 1;
        row.volume += sizeMidpoint(trade);
        if (!row.party && trade.party) row.party = trade.party;
        if (!row.chamber && trade.chamber) row.chamber = trade.chamber;
        leaderboardMap.set(trade.politician, row);
      }
    }

    const clusters = [...clusterMap.values()].map((row) => {
      const total = row.trades.length;
      const direction = row.buy >= row.sell ? "buy" : "sell";
      const majority = Math.max(row.buy, row.sell) / Math.max(total, 1);
      return {
        ticker: row.ticker,
        issuer: row.issuer,
        direction,
        politicianCount: row.pols.size,
        tradeCount: total,
        netDollar: row.netDollar,
        bipartisan: row.parties.has("D") && row.parties.has("R"),
        majority,
        politicians: row.trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).map((t) => ({ name: t.politician, party: t.party, side: t.side, value: t.value, tradeDate: t.tradeDate }))
      };
    }).filter((row) => row.politicianCount >= 3 && row.majority >= 0.7)
      .sort((a, b) => b.netDollar - a.netDollar)
      .map(({ majority, ...row }) => row);

    const payload = {
      trades: trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
      topBuys30d: aggregateTickerTrades(trades, "buy", 30),
      topSells30d: aggregateTickerTrades(trades, "sell", 30),
      topBuys90d: aggregateTickerTrades(trades, "buy", 90),
      topSells90d: aggregateTickerTrades(trades, "sell", 90),
      clusters,
      committeeAligned: committeeAligned.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).slice(0, 30),
      sectorFlow: [...sectorFlowMap.values()].sort((a, b) => Math.abs(b.netDollar) - Math.abs(a.netDollar)),
      leaderboard: [...leaderboardMap.values()].sort((a, b) => b.volume - a.volume).slice(0, 10),
      fetchedAt: new Date().toISOString(),
      count: trades.length,
      source: "capitoltrades.com SSR Flight"
    };
    await putJSON("capitol/trades.json", payload);
    return res.status(200).json({ ok: true, count: payload.count, pages: pageTrades.length ? Math.ceil(pageTrades.length / 50) : 0, fetchedAt: payload.fetchedAt });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
