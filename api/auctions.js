// TreasuryDirect Auction API
// Base: https://www.treasurydirect.gov/TA_WS/securities/
//
// Endpoints used:
//   /upcoming    - Announced but not yet auctioned (bidToCoverRatio, highYield = "")
//   /auctioned   - Recently completed auctions with full results
//   /search      - Historical query by date range, type, term
//
// No auth required. No API key. No rate-limit headers observed.
// Response is a JSON array (no wrapper object, no pagination metadata).
// Pagination: ?pagenum=N (1-based) &pagesize=N
// Filtering:  ?type=Bill|Note|Bond|TIPS|FRN  ?startDate=YYYY-MM-DD &endDate=YYYY-MM-DD
//
// Key result fields:
//   auctionDate, securityType, securityTerm, type (Note/Bond/Bill/TIPS)
//   offeringAmount, bidToCoverRatio, highYield, highDiscountRate (bills only)
//   highInvestmentRate (bills only), averageMedianYield
//   directBidderAccepted, directBidderTendered
//   indirectBidderAccepted, indirectBidderTendered
//   primaryDealerAccepted, primaryDealerTendered
//   totalAccepted, totalTendered, noncompetitiveAccepted
//   interestRate (coupon), maturityDate, issueDate, cusip, series
//   reopening (Yes/No), tips (Yes/No)

const BASE = "https://www.treasurydirect.gov/TA_WS/securities";

/**
 * Normalize a raw TreasuryDirect record into a clean shape.
 * Empty-string fields are coerced to null. Numeric strings are parsed.
 */
function normalize(r) {
  const num = (v) => (v === "" || v == null ? null : parseFloat(v));
  const str = (v) => (v === "" || v == null ? null : v);
  const bool = (v) => v === "Yes";

  // Derive a display label: "10-Year Note", "5-Year TIPS", "13-Week Bill", etc.
  const isTips = bool(r.tips);
  const term = r.term || r.securityTerm || r.originalSecurityTerm || "";
  const type = r.type || r.securityType || "";
  const label = (`${term} ${isTips ? "TIPS" : type}`).trim();

  // For bills, yield lives in highDiscountRate / highInvestmentRate
  const yieldValue =
    num(r.highYield) ??
    num(r.highDiscountRate) ??
    num(r.highInvestmentRate);

  // Indirect bidder % of accepted competitive bids (standard demand metric)
  const indirectAccepted = num(r.indirectBidderAccepted);
  const directAccepted = num(r.directBidderAccepted);
  const primaryAccepted = num(r.primaryDealerAccepted);
  const compAccepted = num(r.competitiveAccepted);

  const indirectPct =
    compAccepted && indirectAccepted != null
      ? (indirectAccepted / compAccepted) * 100
      : null;
  const directPct =
    compAccepted && directAccepted != null
      ? (directAccepted / compAccepted) * 100
      : null;
  const primaryPct =
    compAccepted && primaryAccepted != null
      ? (primaryAccepted / compAccepted) * 100
      : null;

  // Tail = highYield - averageMedianYield (only meaningful for notes/bonds)
  const avgYield = num(r.averageMedianYield);
  const highYield = num(r.highYield);
  const tail =
    highYield != null && avgYield != null
      ? parseFloat((highYield - avgYield).toFixed(3))
      : null;

  return {
    cusip: str(r.cusip),
    label,
    type: str(r.type) || str(r.securityType),
    term: str(r.term) || str(r.securityTerm),
    originalTerm: str(r.originalSecurityTerm),
    isTips,
    isReopening: bool(r.reopening),
    auctionDate: str(r.auctionDate)?.slice(0, 10) || str(r.auctionDate?.slice?.(0, 10)),
    issueDate: str(r.issueDate)?.slice(0, 10),
    maturityDate: str(r.maturityDate)?.slice(0, 10),
    announcementDate: str(r.announcementDate)?.slice(0, 10),
    coupon: num(r.interestRate),
    offeringAmount: num(r.offeringAmount),
    series: str(r.series),
    // Auction results — null when upcoming
    bidToCoverRatio: num(r.bidToCoverRatio),
    yield: yieldValue,
    highYield: num(r.highYield),
    highDiscountRate: num(r.highDiscountRate),
    highInvestmentRate: num(r.highInvestmentRate),
    averageMedianYield: avgYield,
    tail,
    // Demand breakdown percentages (of competitive accepted)
    indirectPct: indirectPct != null ? parseFloat(indirectPct.toFixed(2)) : null,
    directPct: directPct != null ? parseFloat(directPct.toFixed(2)) : null,
    primaryDealerPct: primaryPct != null ? parseFloat(primaryPct.toFixed(2)) : null,
    // Raw accepted amounts (in dollars)
    totalAccepted: num(r.totalAccepted),
    totalTendered: num(r.totalTendered),
    noncompetitiveAccepted: num(r.noncompetitiveAccepted),
    indirectBidderAccepted: indirectAccepted,
    directBidderAccepted: directAccepted,
    primaryDealerAccepted: primaryAccepted,
    pricePer100: num(r.pricePer100) || num(r.highPrice),
    allocationPercentage: num(r.allocationPercentage),
    auctionFormat: str(r.auctionFormat),
    closingTimeCompetitive: str(r.closingTimeCompetitive),
  };
}

/**
 * Fetch a TreasuryDirect endpoint with error handling.
 * Returns parsed array or throws.
 */
async function fetchTD(path, params = {}) {
  const qs = new URLSearchParams({ format: "json", ...params }).toString();
  const url = `${BASE}/${path}?${qs}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "MacroTerminal/1.0" },
  });
  if (!resp.ok) throw new Error(`TreasuryDirect ${path}: HTTP ${resp.status}`);
  return resp.json();
}

export default async function handler(req, res) {
  const { mode = "full", type, term, startDate, endDate, pagesize = "20", pagenum = "1" } =
    req.query;

  try {
    if (mode === "upcoming") {
      // --- Upcoming (announced, not yet auctioned) ---
      const raw = await fetchTD("upcoming", { pagesize, pagenum });
      const data = (Array.isArray(raw) ? raw : []).map(normalize);
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
      return res.status(200).json({ mode: "upcoming", count: data.length, auctions: data });
    }

    if (mode === "recent") {
      // --- Recent completed auctions (last N, all types) ---
      // Fetch notes/bonds and bills in parallel for a richer mix
      const params = { pagesize: pagesize || "10", pagenum };
      if (type) params.type = type;

      const raw = await fetchTD("auctioned", params);
      const data = (Array.isArray(raw) ? raw : []).map(normalize);
      res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
      return res.status(200).json({ mode: "recent", count: data.length, auctions: data });
    }

    if (mode === "historical") {
      // --- Historical search by date range ---
      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ error: "historical mode requires startDate and endDate (YYYY-MM-DD)" });
      }
      const params = { startDate, endDate, pagesize, pagenum };
      if (type) params.type = type;
      if (term) params.securityTerm = term;

      const raw = await fetchTD("search", params);
      const data = (Array.isArray(raw) ? raw : []).map(normalize);
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
      return res.status(200).json({
        mode: "historical",
        count: data.length,
        startDate,
        endDate,
        auctions: data,
      });
    }

    // --- Default: full dashboard payload (upcoming + recent notes/bonds + recent bills) ---
    const [upcomingRaw, recentCouponsRaw, recentBillsRaw] = await Promise.all([
      fetchTD("upcoming", { pagesize: "20" }),
      // Recent coupon securities (Notes, Bonds, TIPS) - exclude Bills
      fetchTD("auctioned", { pagesize: "15", type: "Note" }),
      fetchTD("auctioned", { pagesize: "10", type: "Bill" }),
    ]);

    const upcoming = (Array.isArray(upcomingRaw) ? upcomingRaw : [])
      .map(normalize)
      .sort((a, b) => (a.auctionDate > b.auctionDate ? 1 : -1));

    const recentCoupons = (Array.isArray(recentCouponsRaw) ? recentCouponsRaw : []).map(normalize);
    const recentBills = (Array.isArray(recentBillsRaw) ? recentBillsRaw : []).map(normalize);

    // Merge and sort recent by auctionDate desc, keep top 20
    const recentAll = [...recentCoupons, ...recentBills]
      .sort((a, b) => (a.auctionDate < b.auctionDate ? 1 : -1))
      .slice(0, 20);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({
      mode: "full",
      fetched: new Date().toISOString(),
      upcoming: { count: upcoming.length, auctions: upcoming },
      recent: { count: recentAll.length, auctions: recentAll },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
