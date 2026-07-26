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

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
    try {
      const res = await fetch(`/api/fred?${params}`);
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`FRED ${seriesId}: ${res.status}`);
        continue;
      }
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
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * fetchBatch — single POST to /api/fred-batch for an entire seriesMap.
 * Returns { [key]: observations[] } for all fulfilled series.
 * Keys for failed series are omitted (errors are returned separately but
 * callers that only care about data will get a partial result rather than
 * a total drop — the silent-drop path is gone).
 */
export async function fetchBatch(seriesMap) {
  const entries = Object.entries(seriesMap);
  // Respect existing client-side cache: split into cached vs uncached
  const cachedResults = {};
  const uncached = [];

  for (const [key, opts] of entries) {
    const ck = cacheKey(opts.id, { limit: opts.limit ?? 30, frequency: opts.frequency ?? "d", units: opts.units, offset: opts.offset });
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.ts < getCacheTTL(opts.frequency ?? "d")) {
      cachedResults[key] = hit.data;
    } else {
      uncached.push({ key, opts, ck });
    }
  }

  if (uncached.length === 0) return cachedResults;

  const seriesList = uncached.map(({ key, opts }) => ({
    key,
    id: opts.id,
    units: opts.units,
    limit: opts.limit ?? 30,
  }));

  let batchResult;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
    try {
      const res = await fetch("/api/fred-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series: seriesList }),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`fred-batch: ${res.status}`);
        continue;
      }
      if (res.status === 404) {
        // /api/fred-batch not available (local dev without Vercel CLI).
        // Fall back to per-series fetches so the dev server still works.
        return fetchMultiple(seriesMap);
      }
      if (!res.ok) throw new Error(`fred-batch: ${res.status}`);
      batchResult = await res.json();
      break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!batchResult) throw lastError;

  // Populate client cache for each fulfilled series
  for (const { key, opts, ck } of uncached) {
    if (batchResult.data && batchResult.data[key] !== undefined) {
      cache.set(ck, { data: batchResult.data[key], ts: Date.now() });
    }
  }

  return { ...cachedResults, ...(batchResult.data ?? {}) };
}

export async function fetchMultiple(seriesMap) {
  const entries = Object.entries(seriesMap);
  const results = await Promise.allSettled(
    entries.map(([key, opts], i) =>
      new Promise(resolve => setTimeout(resolve, i * 50))
        .then(() => fetchSeries(opts.id, opts))
        .then((data) => [key, data])
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

// For series that are already percentages/rates (CPI YoY, unemployment, GDP SAAR %, etc.).
// Returns the absolute percentage-point difference, not a relative-% change.
export function diff(current, previous) {
  if (current == null || previous == null) return null;
  return current - previous;
}

export function formatNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function formatPct(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

// Percentage-point formatter (e.g. "+0.3pp", "-0.2pp"). Use when comparing two rates.
export function formatPP(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}pp`;
}

export const SERIES = {
  // Market snapshot
  SP500: { id: "SP500", frequency: "d" },
  NASDAQ: { id: "NASDAQCOM", frequency: "d" },
  DXY: { id: "DTWEXBGS", frequency: "d", limit: 30 },
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
  DGS3: { id: "DGS3", frequency: "d" },
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
  // PPI Final Demand (headline BLS PPI). PPIACO (All Commodities) was used
  // before but its commodity-heavy basket ran ~13% YoY vs ~6% for Final Demand
  // in mid-2026 — misleading next to CPI/PCE on the Inflation tab.
  PPI: { id: "PPIFIS", frequency: "m", limit: 24, units: "pc1" },

  // Inflation components (SA indexes, YoY via pc1)
  CPI_SHELTER:    { id: "CUSR0000SAH1",   frequency: "m", limit: 12, units: "pc1" },
  CPI_FOOD:       { id: "CPIUFDSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_ENERGY:     { id: "CPIENGSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_MEDICAL:    { id: "CPIMEDSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_APPAREL:    { id: "CPIAPPSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_TRANSPORT:  { id: "CPITRNSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_RECREATION: { id: "CPIRECSL",       frequency: "m", limit: 12, units: "pc1" },
  CPI_USED_CARS:  { id: "CUSR0000SETA02", frequency: "m", limit: 12, units: "pc1" },

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
  JOLTS_LAYOFF_RATE:  { id: "JTSLDR", frequency: "m", limit: 36 }, // layoffs/discharges, %
  JOLTS_LAYOFF_LEVEL: { id: "JTSLDL", frequency: "m", limit: 36 }, // layoffs/discharges, thousands
  BREAKEVEN: { id: "T10YIE", frequency: "d", limit: 60 },

  // Risk
  UMCSENT: { id: "UMCSENT", frequency: "m", limit: 24 },
  HYSPREAD: { id: "BAMLH0A0HYM2", frequency: "d", limit: 60 },
  RECESSION: { id: "RECPROUSM156N", frequency: "m", limit: 12 },
  NFCI: { id: "NFCI", frequency: "d", limit: 52 },
  STLFSI: { id: "ANFCI", frequency: "w", limit: 52 },
  WALCL: { id: "WALCL", frequency: "d", limit: 52 },
  RRPONTSYD: { id: "RRPONTSYD", frequency: "d", limit: 60 },

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
