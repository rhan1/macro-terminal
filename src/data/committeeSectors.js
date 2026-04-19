// Committee → SPDR sector overlap map. Used to flag committee-aligned
// trades on the Capitol tab. Keep entries conservative — only include
// mappings where academic evidence / intuition suggests meaningful
// information asymmetry. Judiciary, Budget, Ethics: no direct overlap.

export const COMMITTEE_SECTORS = {
  "Armed Services":                        ["Industrials", "Defense"],
  "Foreign Affairs":                       ["Defense"],
  "Foreign Relations":                     ["Defense"],
  "Intelligence":                          ["Industrials", "Technology", "Defense"],
  "Banking":                               ["Financials"],
  "Banking, Housing, and Urban Affairs":   ["Financials", "Real Estate"],
  "Financial Services":                    ["Financials"],
  "Agriculture":                           ["Consumer Staples"],
  "Energy and Commerce":                   ["Energy", "Health Care", "Communication Services"],
  "Energy and Natural Resources":          ["Energy", "Materials"],
  "Natural Resources":                     ["Energy", "Materials"],
  "Environment and Public Works":          ["Utilities", "Materials"],
  "Health, Education, Labor, and Pensions": ["Health Care"],
  "HELP":                                  ["Health Care"],
  "Transportation and Infrastructure":     ["Industrials"],
  "Commerce, Science, and Transportation": ["Technology", "Communication Services", "Industrials"],
  "Veterans' Affairs":                     ["Health Care"],
  "Ways and Means":                        ["Financials"],
  "Finance":                               ["Financials"],
};

// Hand-curated ticker → sector bucket (used when the cron can't compute
// sector from live Yahoo metadata). Keep in sync with COMMITTEE_SECTORS.
export const TICKER_SECTORS = {
  // Defense primes
  LMT: "Defense", RTX: "Defense", GD: "Defense", NOC: "Defense", BA: "Defense",
  LHX: "Defense", HII: "Defense", KTOS: "Defense", BAH: "Defense", LDOS: "Defense",

  // Big banks
  JPM: "Financials", BAC: "Financials", WFC: "Financials", C: "Financials",
  GS: "Financials", MS: "Financials", BK: "Financials", SCHW: "Financials",

  // Oil & gas
  XOM: "Energy", CVX: "Energy", COP: "Energy", EOG: "Energy", SLB: "Energy",
  MPC: "Energy", PSX: "Energy", VLO: "Energy",

  // Big tech
  NVDA: "Technology", MSFT: "Technology", GOOGL: "Technology", GOOG: "Technology",
  AAPL: "Technology", META: "Technology", AMZN: "Technology", TSLA: "Technology",
  AVGO: "Technology", ORCL: "Technology", CRM: "Technology", ADBE: "Technology",

  // Pharma + insurers
  PFE: "Health Care", JNJ: "Health Care", LLY: "Health Care", MRK: "Health Care",
  UNH: "Health Care", ABBV: "Health Care", ABT: "Health Care", TMO: "Health Care",

  // Staples
  KO: "Consumer Staples", PEP: "Consumer Staples", COST: "Consumer Staples",
  WMT: "Consumer Staples", PG: "Consumer Staples", CL: "Consumer Staples",

  // Materials
  NEM: "Materials", FCX: "Materials", LIN: "Materials", DD: "Materials",

  // REITs
  AMT: "Real Estate", PLD: "Real Estate", SPG: "Real Estate", O: "Real Estate",

  // Industrials (non-defense)
  UNP: "Industrials", UPS: "Industrials", HON: "Industrials", CAT: "Industrials",
  DE: "Industrials", GE: "Industrials",

  // Communication services
  NFLX: "Communication Services", DIS: "Communication Services",
  TMUS: "Communication Services", VZ: "Communication Services", T: "Communication Services",

  // Utilities
  NEE: "Utilities", DUK: "Utilities", SO: "Utilities", AEP: "Utilities",

  // Discretionary
  HD: "Consumer Discretionary", NKE: "Consumer Discretionary", MCD: "Consumer Discretionary",
  SBUX: "Consumer Discretionary",
};

// Helper: true if a politician's committee list overlaps a ticker's sector
export function isCommitteeAligned(memberCommittees, ticker) {
  if (!ticker) return false;
  const tSector = TICKER_SECTORS[ticker.toUpperCase()];
  if (!tSector) return false;
  for (const c of memberCommittees || []) {
    const committeeName = typeof c === "string" ? c : c.name;
    const sectors = COMMITTEE_SECTORS[committeeName] || [];
    if (sectors.includes(tSector)) return true;
    // "Defense" is an unofficial bucket — treat it as overlapping Industrials too.
    if (tSector === "Defense" && sectors.includes("Defense")) return true;
  }
  return false;
}
