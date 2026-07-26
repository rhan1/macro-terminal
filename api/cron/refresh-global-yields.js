import { putJSON } from "../../netlify/lib/netlify-blob.mjs";

// ── Source strategy (rewritten 2026-07-04) ────────────────────────────────────
// The original primary source (TradingEconomics scraped via ScrapingBee) is dead:
// the ScrapingBee trial key exhausted its 1000 credits (premium_proxy=true costs
// 25 credits/request × 10 countries/day) and the trial lapsed 2026-05-03 — every
// call now returns HTTP 401 {"message":"Monthly API calls limit reached: 1000"}.
// That made ALL 10 countries silently fall back to monthly OECD FRED series
// labeled plain "FRED" with dailyChange:null.
//
// New strategy — honest source + honest asOf per row:
//   US  → FRED DGS10 (daily)             → value + dailyChange
//   CN  → EastMoney RPTA_WEB_TREASURYYIELD (daily ChinaBond 10Y CGB, keyless)
//         → value + dailyChange. (FRED has NO China 10Y: IRLTLT01CNM156N does
//         not exist; INTDSRCNM193N is the PBoC discount rate, ~1yr stale — not
//         a 10Y yield, so it is no longer used.)
//   DE/GB/JP/FR/IT/ES/CA/AU → FRED IRLTLT01xxM156N (monthly OECD long-term
//         yields; FRED carries no daily 10Y series for these countries)
//         → value only, source "FRED (monthly)", dailyChange omitted.
// Countries that fail to resolve are OMITTED from the payload (no null rows);
// failures are reported in the cron response instead.

export const COUNTRIES = [
  { country: "United States", countryCode: "US", flag: "🇺🇸", fredDaily: "DGS10", fredMonthly: "IRLTLT01USM156N" },
  { country: "Germany", countryCode: "DE", flag: "🇩🇪", fredMonthly: "IRLTLT01DEM156N" },
  { country: "United Kingdom", countryCode: "GB", flag: "🇬🇧", fredMonthly: "IRLTLT01GBM156N" },
  { country: "Japan", countryCode: "JP", flag: "🇯🇵", fredMonthly: "IRLTLT01JPM156N" },
  { country: "France", countryCode: "FR", flag: "🇫🇷", fredMonthly: "IRLTLT01FRM156N" },
  { country: "Italy", countryCode: "IT", flag: "🇮🇹", fredMonthly: "IRLTLT01ITM156N" },
  { country: "Spain", countryCode: "ES", flag: "🇪🇸", fredMonthly: "IRLTLT01ESM156N" },
  { country: "Canada", countryCode: "CA", flag: "🇨🇦", fredMonthly: "IRLTLT01CAM156N" },
  { country: "Australia", countryCode: "AU", flag: "🇦🇺", fredMonthly: "IRLTLT01AUM156N" },
  { country: "China", countryCode: "CN", flag: "🇨🇳", eastmoneyField: "EMM00166466" },
];

const EASTMONEY_URL =
  "https://datacenter.eastmoney.com/api/data/get?type=RPTA_WEB_TREASURYYIELD&sty=ALL&st=SOLAR_DATE&sr=-1&p=1&ps=10";

async function fetchFredObservations(seriesId, fredKey, limit = 4) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${encodeURIComponent(fredKey)}&file_type=json&sort_order=desc&limit=${limit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`FRED ${seriesId} HTTP ${resp.status}`);
  const data = await resp.json();
  return (data?.observations ?? [])
    .filter((o) => o?.value && o.value !== "." && Number.isFinite(Number(o.value)))
    .map((o) => ({ date: o.date, value: Number(o.value) }));
}

async function fetchFredDaily(seriesId, fredKey) {
  const obs = await fetchFredObservations(seriesId, fredKey, 4);
  if (!obs.length) return null;
  const dailyChange = obs.length >= 2 ? Number((obs[0].value - obs[1].value).toFixed(3)) : null;
  return {
    value: obs[0].value,
    ...(dailyChange != null ? { dailyChange } : {}),
    source: "FRED (daily)",
    asOf: obs[0].date,
  };
}

async function fetchFredMonthly(seriesId, fredKey) {
  const obs = await fetchFredObservations(seriesId, fredKey, 2);
  if (!obs.length) return null;
  // Monthly lagged series: no dailyChange — omitting the field is the honest choice.
  return { value: obs[0].value, source: "FRED (monthly)", asOf: obs[0].date };
}

async function fetchEastmoneyChina(field) {
  const resp = await fetch(EASTMONEY_URL, {
    signal: AbortSignal.timeout(12000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Referer: "https://data.eastmoney.com/cjsj/zmgzsyl.html",
    },
  });
  if (!resp.ok) throw new Error(`EastMoney HTTP ${resp.status}`);
  const data = await resp.json();
  const rows = (data?.result?.data ?? []).filter((r) => Number.isFinite(Number(r?.[field])));
  if (!rows.length) return null;
  const value = Number(Number(rows[0][field]).toFixed(4));
  const dailyChange = rows.length >= 2 ? Number((rows[0][field] - rows[1][field]).toFixed(3)) : null;
  return {
    value,
    ...(dailyChange != null ? { dailyChange } : {}),
    source: "EastMoney (daily)",
    asOf: String(rows[0].SOLAR_DATE ?? "").slice(0, 10) || undefined,
  };
}

async function resolveCountry(entry, fredKey) {
  if (entry.eastmoneyField) return fetchEastmoneyChina(entry.eastmoneyField);
  if (entry.fredDaily) {
    try {
      const daily = await fetchFredDaily(entry.fredDaily, fredKey);
      if (daily) return daily;
    } catch {}
    // Daily series hiccup: fall back to the monthly series rather than dropping the row.
  }
  return fetchFredMonthly(entry.fredMonthly, fredKey);
}

/**
 * Resolve all countries. Exported for local verification (run outside Netlify).
 * Returns { yields, failed } — failed rows are excluded from yields entirely
 * so the UI never renders a null/dash row.
 */
export async function collectYields(fredKey) {
  const fetchedAt = new Date().toISOString();
  const settled = await Promise.allSettled(COUNTRIES.map((entry) => resolveCountry(entry, fredKey)));

  const yields = [];
  const failed = [];
  settled.forEach((result, index) => {
    const entry = COUNTRIES[index];
    const data = result.status === "fulfilled" ? result.value : null;
    if (data?.value != null && Number.isFinite(data.value)) {
      yields.push({
        country: entry.country,
        countryCode: entry.countryCode,
        flag: entry.flag,
        value: data.value,
        ...(data.dailyChange != null ? { dailyChange: data.dailyChange } : {}),
        source: data.source,
        asOf: data.asOf,
        fetchedAt,
      });
    } else {
      failed.push({
        countryCode: entry.countryCode,
        error: result.status === "rejected" ? (result.reason?.message ?? "fetch failed") : "no data",
      });
    }
  });

  return { yields, failed, fetchedAt };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const fredKey = process.env.FRED_API_KEY;
    if (!fredKey) return res.status(500).json({ error: "FRED_API_KEY not configured" });

    const { yields, failed, fetchedAt } = await collectYields(fredKey);

    if (yields.length < 5) {
      return res.status(502).json({ error: "not enough countries resolved", failed });
    }

    await putJSON("global/yields.json", { yields, fetchedAt });

    const sources = yields.reduce((acc, item) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({ ok: true, count: yields.length, fetchedAt, sources, ...(failed.length ? { failed } : {}) });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
