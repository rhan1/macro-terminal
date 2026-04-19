import { put } from "@vercel/blob";

const BASE = "https://www.capitoltrades.com/trades";
const YEAR_MS = 365 * 86400000;
const SECTORS = ["Technology", "Financials", "Health Care", "Energy", "Industrials", "Consumer Discretionary", "Consumer Staples", "Utilities", "Real Estate", "Materials", "Communication Services"];
const COMMITTEE_SECTORS = { "Armed Services": ["Industrials", "Defense"], Banking: ["Financials"], "Financial Services": ["Financials"], "Energy and Commerce": ["Energy", "Health Care"], "Energy and Natural Resources": ["Energy"], Agriculture: ["Consumer Staples"], Intelligence: ["Industrials", "Technology"], HELP: ["Health Care"], Health: ["Health Care"], Judiciary: [], "Transportation and Infrastructure": ["Industrials"], "Natural Resources": ["Energy", "Materials"] };
const TICKER_SECTORS = {
  LMT: "Industrials", RTX: "Industrials", GD: "Industrials", NOC: "Industrials", BA: "Industrials", LHX: "Industrials", HII: "Industrials",
  JPM: "Financials", BAC: "Financials", WFC: "Financials", C: "Financials", GS: "Financials", MS: "Financials",
  XOM: "Energy", CVX: "Energy", COP: "Energy", EOG: "Energy",
  NVDA: "Technology", MSFT: "Technology", GOOGL: "Communication Services", AAPL: "Technology", META: "Communication Services", AMZN: "Consumer Discretionary",
  PFE: "Health Care", JNJ: "Health Care", LLY: "Health Care", MRK: "Health Care", UNH: "Health Care", ABBV: "Health Care",
  KO: "Consumer Staples", PEP: "Consumer Staples", COST: "Consumer Staples", WMT: "Consumer Staples", PG: "Consumer Staples",
  NEM: "Materials", FCX: "Materials", LIN: "Materials"
};
const DEFENSE = new Set(["LMT", "RTX", "GD", "NOC", "BA", "LHX", "HII"]);
const FINANCIAL = new Set(["JPM", "BAC", "WFC", "C", "GS", "MS"]);

function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}
function stripTags(s) { return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function toIso(s) {
  const cleaned = String(s || "").replace(/\./g, "").trim();
  const d = cleaned ? new Date(cleaned) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}
function parseSizeRange(s) {
  const nums = String(s || "").match(/\$?([\d,]+)/g) || [];
  const vals = nums.map((x) => parseInt(x.replace(/[^\d]/g, ""), 10)).filter(Number.isFinite);
  return { sizeBracket: String(s || "").trim() || null, sizeLow: vals[0] ?? null, sizeHigh: vals[1] ?? vals[0] ?? null };
}
function parseParty(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("dem")) return "D";
  if (v.includes("rep")) return "R";
  if (v.includes("ind")) return "I";
  return null;
}
function parseChamber(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("house") || v === "h") return "H";
  if (v.includes("senate") || v === "s") return "S";
  return null;
}
function parseSide(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("purchase")) return "buy";
  if (v.includes("sale")) return "sell";
  return null;
}
function parseSecurityType(...parts) {
  const text = parts.join(" ").toLowerCase();
  if (text.includes("crypto")) return "crypto";
  if (text.includes("bond")) return "bond";
  if (text.includes("option")) return "option";
  return "stock";
}
function sizeMidpoint(trade) { return trade.sizeLow != null && trade.sizeHigh != null ? (trade.sizeLow + trade.sizeHigh) / 2 : 0; }
function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function weekKey(dateIso) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = Math.ceil((((d - jan4) / 86400000) + jan4.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function issuerSector(issuer) {
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
function parseTrades(html) {
  const trades = [];
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
    if (cells.length < 9) continue;
    const [politician, partyRaw, chamberRaw, tradedRaw, filedRaw, tickerRaw, issuerRaw, sideRaw, sizeRaw] = cells;
    const ticker = (tickerRaw.match(/\b[A-Z]{1,5}\b/) || [])[0] || null;
    const side = parseSide(sideRaw);
    const tradeDate = toIso(tradedRaw);
    const filedDate = toIso(filedRaw);
    if (!politician || !tradeDate || !side) continue;
    const sizes = parseSizeRange(sizeRaw);
    trades.push({
      politician,
      party: parseParty(partyRaw),
      chamber: parseChamber(chamberRaw),
      ticker,
      issuer: issuerRaw || null,
      side,
      ...sizes,
      tradeDate,
      filedDate,
      securityType: parseSecurityType(row, tickerRaw, issuerRaw)
    });
  }
  return trades;
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" });
    const apiKey = process.env.SCRAPINGBEE_API_KEY;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!apiKey) return res.status(500).json({ error: "SCRAPINGBEE_API_KEY not configured" });
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not configured" });
    const backfillRaw = Array.isArray(req.query?.backfill) ? req.query.backfill[0] : req.query?.backfill;
    const backfill = Math.max(1, parseInt(backfillRaw || "60", 10) || 60);
    const cutoff = new Date(Date.now() - YEAR_MS).toISOString().slice(0, 10);
    const pageTrades = [];
    let anyRows = false;
    for (let page = 1; page <= backfill; page += 1) {
      const teUrl = `${BASE}?page=${page}&pageSize=50`;
      const url = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(teUrl)}&render_js=true&premium_proxy=true`; // ScrapingBee wrapper URL for CapitolTrades pages
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error(`scrape failed on page ${page}: ${resp.status}`);
      const trades = parseTrades(await resp.text());
      if (trades.length) anyRows = true;
      pageTrades.push(...trades);
      const oldest = trades.map((x) => x.tradeDate).filter(Boolean).sort()[0] || null;
      if (trades.length < 10 || (oldest && oldest < cutoff)) break; // Stop once pagination thins out or the page is older than the 365d storage horizon
    }
    const seen = new Set();
    const trades = [];
    for (const trade of pageTrades) {
      if (trade.tradeDate < cutoff) continue;
      const key = `${trade.politician}-${trade.ticker}-${trade.tradeDate}-${trade.side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      trades.push(trade);
    }
    if (!anyRows || trades.length < 30) return res.status(502).json({ error: "scrape returned too few trades" });
    const last14 = isoDaysAgo(14);
    const last60 = isoDaysAgo(60);
    const last90 = isoDaysAgo(90);
    const ytd = `${new Date().getUTCFullYear()}-01-01`;
    const clusterMap = new Map();
    const committeeAligned = [];
    const sectorFlowMap = new Map(SECTORS.map((sector) => [sector, { sector, netDollar: 0, buyDollar: 0, sellDollar: 0, tradeCount: 0 }]));
    const leaderboardMap = new Map();
    for (const trade of trades) {
      weekKey(trade.tradeDate);
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
      const proxyCommittee = trade.ticker && (DEFENSE.has(trade.ticker) ? "Armed Services" : FINANCIAL.has(trade.ticker) ? "Banking" : null);
      if (trade.tradeDate >= last60 && proxyCommittee) committeeAligned.push({ ...trade, committeeAligned: true, proxyCommittee, sector: TICKER_SECTORS[trade.ticker] || COMMITTEE_SECTORS[proxyCommittee][0] || null });
      const sector = (trade.ticker && TICKER_SECTORS[trade.ticker]) || issuerSector(trade.issuer);
      if (trade.tradeDate >= last90 && sector && sectorFlowMap.has(sector)) {
        const row = sectorFlowMap.get(sector);
        const amt = sizeMidpoint(trade);
        const signed = trade.side === "buy" ? amt : -amt; // Sector flow treats buys as positive dollars and sells as negative dollars
        row.netDollar += signed;
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
        politicians: row.trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).map((t) => ({ name: t.politician, party: t.party, side: t.side, sizeBracket: t.sizeBracket, tradeDate: t.tradeDate }))
      };
    }).filter((row) => row.politicianCount >= 3 && row.majority >= 0.7) // Cluster requires a 70% majority on one side across the last-14d ticker activity
      .sort((a, b) => b.netDollar - a.netDollar).map(({ majority, ...row }) => row);
    const topBuys30d = aggregateTickerTrades(trades, "buy", 30);
    const topSells30d = aggregateTickerTrades(trades, "sell", 30);
    const topBuys90d = aggregateTickerTrades(trades, "buy", 90);
    const topSells90d = aggregateTickerTrades(trades, "sell", 90);
    const payload = {
      trades: trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
      topBuys30d,
      topSells30d,
      topBuys90d,
      topSells90d,
      clusters,
      committeeAligned: committeeAligned.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).slice(0, 30),
      sectorFlow: [...sectorFlowMap.values()].sort((a, b) => Math.abs(b.netDollar) - Math.abs(a.netDollar)),
      leaderboard: [...leaderboardMap.values()].sort((a, b) => b.volume - a.volume).slice(0, 10),
      fetchedAt: new Date().toISOString(),
      count: trades.length
    };
    await put("capitol/trades.json", JSON.stringify(payload), { access: "private", contentType: "application/json", token, addRandomSuffix: false, allowOverwrite: true });
    return res.status(200).json({ ok: true, count: payload.count, fetchedAt: payload.fetchedAt });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
