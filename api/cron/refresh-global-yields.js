import { put } from "@vercel/blob";

export const COUNTRIES = [
  { country: "United States", countryCode: "US", flag: "🇺🇸", tePath: "united-states", fredSeries: "IRLTLT01USM156N" },
  { country: "Germany", countryCode: "DE", flag: "🇩🇪", tePath: "germany", fredSeries: "IRLTLT01DEM156N" },
  { country: "United Kingdom", countryCode: "GB", flag: "🇬🇧", tePath: "united-kingdom", fredSeries: "IRLTLT01GBM156N" },
  { country: "Japan", countryCode: "JP", flag: "🇯🇵", tePath: "japan", fredSeries: "IRLTLT01JPM156N" },
  { country: "France", countryCode: "FR", flag: "🇫🇷", tePath: "france", fredSeries: "IRLTLT01FRM156N" },
  { country: "Italy", countryCode: "IT", flag: "🇮🇹", tePath: "italy", fredSeries: "IRLTLT01ITM156N" },
  { country: "Spain", countryCode: "ES", flag: "🇪🇸", tePath: "spain", fredSeries: "IRLTLT01ESM156N" },
  { country: "Canada", countryCode: "CA", flag: "🇨🇦", tePath: "canada", fredSeries: "IRLTLT01CAM156N" },
  { country: "Australia", countryCode: "AU", flag: "🇦🇺", tePath: "australia", fredSeries: "IRLTLT01AUM156N" },
  { country: "China", countryCode: "CN", flag: "🇨🇳", tePath: "china", fredSeries: "IRLTLT01CNM156N" },
];

function parseTradingEconomics(html, country) {
  const main = html.match(/(\d+\.\d{2,3})\s*<\/td>\s*<td[^>]*>([+-]?\d+\.\d{1,3})/i);
  if (main) return { value: Number(main[1]), dailyChange: Number(main[2]), source: "TradingEconomics" };
  const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nearCountry = html.match(new RegExp(`${escaped}[\\s\\S]{0,300}?(\\d+\\.\\d{1,3})(?:[\\s\\S]{0,80}?([+-]?\\d+\\.\\d{1,3}))?`, "i"));
  if (nearCountry) {
    return {
      value: Number(nearCountry[1]),
      dailyChange: nearCountry[2] ? Number(nearCountry[2]) : null,
      source: "TradingEconomics",
    };
  }
  const approx = html.slice(0, 20000).match(/\d+\.\d{2,4}/);
  if (approx) return { value: Number(approx[0]), dailyChange: null, source: "TradingEconomics" };
  return null;
}

async function fetchTradingEconomics(entry, scrapingBeeKey) {
  const teUrl = `https://tradingeconomics.com/${entry.tePath}/government-bond-yield`;
  const url = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(scrapingBeeKey)}&url=${encodeURIComponent(teUrl)}&render_js=false&premium_proxy=true`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`TE HTTP ${resp.status}`);
  return parseTradingEconomics(await resp.text(), entry.country);
}

async function fetchFred(entry, fredKey) {
  if (!fredKey) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${entry.fredSeries}&api_key=${encodeURIComponent(fredKey)}&file_type=json&sort_order=desc&limit=2`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`FRED HTTP ${resp.status}`);
  const data = await resp.json();
  const obs = data?.observations?.find((item) => item?.value && item.value !== ".");
  return obs ? { value: Number(obs.value), dailyChange: null, source: "FRED" } : null;
}

async function resolveCountry(entry, scrapingBeeKey, fredKey) {
  try {
    const te = await fetchTradingEconomics(entry, scrapingBeeKey);
    if (te?.value != null && Number.isFinite(te.value)) return te;
  } catch {}
  try {
    const fred = await fetchFred(entry, fredKey);
    if (fred?.value != null && Number.isFinite(fred.value)) return fred;
  } catch {}
  return { value: null, dailyChange: null, source: null, error: "scrape+fred failed" };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const scrapingBeeKey = process.env.SCRAPINGBEE_API_KEY;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const fredKey = process.env.FRED_API_KEY;
    if (!scrapingBeeKey) return res.status(500).json({ error: "SCRAPINGBEE_API_KEY not configured" });
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not configured" });

    const fetchedAt = new Date().toISOString();
    const settled = await Promise.allSettled(COUNTRIES.map((entry) => resolveCountry(entry, scrapingBeeKey, fredKey)));
    const yields = settled.map((result, index) => {
      const entry = COUNTRIES[index];
      const data = result.status === "fulfilled" ? result.value : { value: null, dailyChange: null, source: null, error: "scrape+fred failed" };
      return {
        country: entry.country,
        countryCode: entry.countryCode,
        flag: entry.flag,
        value: data.value,
        dailyChange: data.dailyChange,
        source: data.source,
        fetchedAt,
        ...(data.error ? { error: data.error } : {}),
      };
    });

    const count = yields.filter((item) => item.value != null).length;
    if (count < 5) return res.status(502).json({ error: "not enough countries resolved" });

    await put("global/yields.json", JSON.stringify({ yields, fetchedAt }), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const sources = yields.reduce(
      (acc, item) => {
        if (item.source === "TradingEconomics") acc.TradingEconomics += 1;
        else if (item.source === "FRED") acc.FRED += 1;
        else acc.failed += 1;
        return acc;
      },
      { TradingEconomics: 0, FRED: 0, failed: 0 }
    );

    return res.status(200).json({ ok: true, count, fetchedAt, sources });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
