const cache = new Map();

function cacheKey(seriesId, params) {
  return `${seriesId}:${JSON.stringify(params)}`;
}

function getCacheTTL(frequency) {
  if (frequency === "d") return 4 * 60 * 60 * 1000;
  if (frequency === "m") return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

export async function fetchSeries(seriesId, { limit = 30, frequency = "d", units, offset } = {}) {
  const key = cacheKey(seriesId, { limit, frequency, units, offset });
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < getCacheTTL(frequency)) {
    return cached.data;
  }

  const params = new URLSearchParams({
    series_id: seriesId,
    sort_order: "desc",
    limit: String(limit),
  });
  if (units) params.set("units", units);

  const res = await fetch(`/api/fred?${params}`);
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = await res.json();

  const data = (json.observations || [])
    .filter((o) => o.value !== ".")
    .map((o) => ({
      date: o.date,
      value: parseFloat(o.value),
    }));

  cache.set(key, { data, ts: Date.now() });
  return data;
}

export async function fetchMultiple(seriesMap) {
  const entries = Object.entries(seriesMap);
  const results = await Promise.allSettled(
    entries.map(([key, opts]) =>
      fetchSeries(opts.id, opts).then((data) => [key, data])
    )
  );
  const out = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [key, data] = r.value;
      out[key] = data;
    }
  }
  return out;
}

export function latest(data) {
  return data && data.length > 0 ? data[0] : null;
}

export function prior(data, n = 1) {
  return data && data.length > n ? data[n] : null;
}

export function change(current, previous) {
  if (!current || !previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function formatPct(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export const SERIES = {
  // Market snapshot
  SP500: { id: "SP500", frequency: "d" },
  NASDAQ: { id: "NASDAQCOM", frequency: "d" },
  DGS10: { id: "DGS10", frequency: "d" },
  DGS2: { id: "DGS2", frequency: "d" },
  VIXCLS: { id: "VIXCLS", frequency: "d" },
  OIL: { id: "DCOILWTICO", frequency: "d" },
  GOLD: { id: "NASDAQQGLDI", frequency: "d" },

  // Yield curve
  DGS1MO: { id: "DGS1MO", frequency: "d" },
  DGS3MO: { id: "DGS3MO", frequency: "d" },
  DGS6MO: { id: "DGS6MO", frequency: "d" },
  DGS1: { id: "DGS1", frequency: "d" },
  DGS5: { id: "DGS5", frequency: "d" },
  DGS7: { id: "DGS7", frequency: "d" },
  DGS20: { id: "DGS20", frequency: "d" },
  DGS30: { id: "DGS30", frequency: "d" },

  // Rates
  FEDFUNDS: { id: "DFF", frequency: "d" },
  MORTGAGE30: { id: "MORTGAGE30US", frequency: "d", limit: 10 },
  T10Y2Y: { id: "T10Y2Y", frequency: "d" },
  T10Y3M: { id: "T10Y3M", frequency: "d" },

  // Inflation
  CPI: { id: "CPIAUCSL", frequency: "m", limit: 24, units: "pc1" },
  CORECPI: { id: "CPILFESL", frequency: "m", limit: 24, units: "pc1" },
  COREPCE: { id: "PCEPILFE", frequency: "m", limit: 24, units: "pc1" },
  PPI: { id: "PPIACO", frequency: "m", limit: 24, units: "pc1" },

  // Growth
  GDP: { id: "A191RL1Q225SBEA", frequency: "q", limit: 12 },
  M2: { id: "M2SL", frequency: "m", limit: 24, units: "pc1" },
  HOUSING: { id: "HOUST", frequency: "m", limit: 24 },
  INDPRO: { id: "INDPRO", frequency: "m", limit: 24, units: "pc1" },

  // Labor
  UNRATE: { id: "UNRATE", frequency: "m", limit: 24 },
  PAYEMS: { id: "PAYEMS", frequency: "m", limit: 24, units: "chg" },
  WAGES: { id: "CES0500000003", frequency: "m", limit: 24, units: "pc1" },
  CLAIMS: { id: "ICSA", frequency: "d", limit: 30 },
  BREAKEVEN: { id: "T10YIE", frequency: "d", limit: 60 },

  // Risk
  UMCSENT: { id: "UMCSENT", frequency: "m", limit: 24 },
  HYSPREAD: { id: "BAMLH0A0HYM2", frequency: "d", limit: 60 },
  RECESSION: { id: "RECPROUSM156N", frequency: "m", limit: 12 },

  // Real Estate
  CASESHILLER: { id: "CSUSHPINSA", frequency: "m", limit: 36, units: "pc1" },
  MEDPRICE_EXISTING: { id: "HOSMEDUSM052N", frequency: "m", limit: 36 },
  MEDPRICE_NEW: { id: "MSPNHSUS", frequency: "m", limit: 36 },
  MONTHS_SUPPLY: { id: "HOSSUPUSM673N", frequency: "m", limit: 36 },
  ACTIVE_LISTINGS: { id: "ACTLISCOUUS", frequency: "m", limit: 36 },
  DAYS_ON_MARKET: { id: "MEDDAYONMARUS", frequency: "m", limit: 36 },
  HOUSING_STARTS: { id: "HOUST", frequency: "m", limit: 36 },
  PERMITS: { id: "PERMIT", frequency: "m", limit: 36 },
  UNDER_CONSTRUCTION: { id: "UNDCONTSA", frequency: "m", limit: 36 },
  AFFORDABILITY: { id: "FIXHAI", frequency: "m", limit: 36 },
  DELINQUENCY: { id: "DRSFRMACBS", frequency: "q", limit: 20 },
  EXISTING_SALES: { id: "EXHOSLUSM495S", frequency: "m", limit: 36 },
  NEW_SALES: { id: "HSN1F", frequency: "m", limit: 36 },
  OER: { id: "CUSR0000SEHC", frequency: "m", limit: 36, units: "pc1" },
  CPI_RENT: { id: "CUSR0000SEHA", frequency: "m", limit: 36, units: "pc1" },
};
