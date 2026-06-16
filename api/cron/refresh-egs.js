// Replaces the old local macOS LaunchAgent + scripts/refresh-egs-snapshot.mjs
// with a Vercel Cron job: fetch eurogirlsescort.es through ScrapingBee's
// residential proxy, parse the country sidebar, merge into Blob-backed history,
// and write fresh snapshot/history back to private Vercel Blob storage.
// Manual invoke:
// curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/refresh-egs

import { putJSON, getJSON } from "../../netlify/lib/netlify-blob.mjs";

const URL = "https://www.eurogirlsescort.es/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const COUNTRY_RE =
  /flag-icon flag-icon-([a-z]{2})"><\/span>\s*([^<]+?)\s*<\/a>\s*<small>\(([\d,]+)\)<\/small>/g;

const EN_NAME = {
  ad: "Andorra", ae: "United Arab Emirates", af: "Afghanistan", al: "Albania",
  am: "Armenia", ao: "Angola", ar: "Argentina", at: "Austria", au: "Australia",
  az: "Azerbaijan", ba: "Bosnia & Herzegovina", bb: "Barbados", bd: "Bangladesh",
  be: "Belgium", bg: "Bulgaria", bh: "Bahrain", bo: "Bolivia", br: "Brazil",
  bs: "Bahamas", bw: "Botswana", by: "Belarus", ca: "Canada", cd: "DR Congo",
  ch: "Switzerland", ci: "Côte d'Ivoire", cl: "Chile", cm: "Cameroon",
  cn: "China", co: "Colombia", cr: "Costa Rica", cu: "Cuba", cv: "Cape Verde",
  cy: "Cyprus", cz: "Czech Republic", de: "Germany", dk: "Denmark",
  do: "Dominican Republic", dz: "Algeria", ec: "Ecuador", ee: "Estonia",
  eg: "Egypt", es: "Spain", et: "Ethiopia", fi: "Finland", fr: "France",
  gb: "United Kingdom", ge: "Georgia", gh: "Ghana", gr: "Greece",
  gt: "Guatemala", hk: "Hong Kong", hn: "Honduras", hr: "Croatia",
  hu: "Hungary", id: "Indonesia", ie: "Ireland", il: "Israel", in: "India",
  iq: "Iraq", ir: "Iran", is: "Iceland", it: "Italy", jm: "Jamaica",
  jo: "Jordan", jp: "Japan", ke: "Kenya", kg: "Kyrgyzstan", kh: "Cambodia",
  kr: "South Korea", kw: "Kuwait", kz: "Kazakhstan", la: "Laos",
  lb: "Lebanon", li: "Liechtenstein", lk: "Sri Lanka", lt: "Lithuania",
  lu: "Luxembourg", lv: "Latvia", ly: "Libya", ma: "Morocco", mc: "Monaco",
  md: "Moldova", me: "Montenegro", mg: "Madagascar", mk: "North Macedonia",
  ml: "Mali", mm: "Myanmar", mn: "Mongolia", mt: "Malta", mu: "Mauritius",
  mv: "Maldives", mx: "Mexico", my: "Malaysia", mz: "Mozambique",
  na: "Namibia", ng: "Nigeria", ni: "Nicaragua", nl: "Netherlands",
  no: "Norway", np: "Nepal", nz: "New Zealand", om: "Oman", pa: "Panama",
  pe: "Peru", pg: "Papua New Guinea", ph: "Philippines", pk: "Pakistan",
  pl: "Poland", pr: "Puerto Rico", ps: "Palestine", pt: "Portugal",
  py: "Paraguay", qa: "Qatar", ro: "Romania", rs: "Serbia", ru: "Russia",
  rw: "Rwanda", sa: "Saudi Arabia", sd: "Sudan", se: "Sweden", sg: "Singapore",
  si: "Slovenia", sk: "Slovakia", sn: "Senegal", so: "Somalia", sv: "El Salvador",
  sy: "Syria", th: "Thailand", tj: "Tajikistan", tm: "Turkmenistan",
  tn: "Tunisia", tr: "Turkey", tt: "Trinidad & Tobago", tw: "Taiwan",
  tz: "Tanzania", ua: "Ukraine", ug: "Uganda", us: "United States",
  uy: "Uruguay", uz: "Uzbekistan", ve: "Venezuela", vn: "Vietnam",
  ye: "Yemen", za: "South Africa", zm: "Zambia", zw: "Zimbabwe",
};

const REF_POP = {
  gb: 9.5, de: 3.6, fr: 11.1, es: 6.7, it: 4.3, nl: 1.1, ch: 1.4, at: 2.0,
  pl: 1.8, ro: 1.8, hu: 1.8, cz: 1.3, bg: 1.7, gr: 3.2, pt: 2.9, se: 1.6,
  dk: 1.4, no: 1.1, fi: 1.3, ie: 2.0, be: 1.2, lu: 0.6, sk: 0.7, si: 0.3,
  ee: 0.4, lv: 0.6, lt: 0.5, hr: 0.8, rs: 1.4, ba: 0.3, al: 0.5, mk: 0.6,
  md: 0.5, ua: 2.9, by: 2.0, ru: 12.6, tr: 15.8, cy: 0.3, am: 1.1, ge: 1.2,
  ad: 0.1, mt: 0.4, is: 0.2, me: 0.2, kz: 1.9, ae: 3.5, qa: 2.0, sa: 7.6,
  il: 4.3, hk: 7.5, sg: 5.9, th: 10.5, jp: 37.4, kr: 9.9, ca: 6.2, br: 22.0,
  mx: 22.0, co: 11.3, ve: 2.9, ar: 3.1, cl: 6.8, pe: 11.0, uy: 1.8, us: 19.5,
  au: 5.3, nz: 1.7, za: 5.6, ma: 3.9, eg: 21.3, ng: 15.4, tn: 2.7, dz: 3.7,
  in: 30.3, id: 10.8, my: 7.8, vn: 9.1, ph: 13.5, pk: 15.0, bd: 22.5, ir: 9.0,
  iq: 7.5, lb: 2.2, sy: 2.5, jo: 4.5, ye: 2.8, np: 1.4, lk: 2.3, tw: 2.6,
};

const TREND_POINTS = 12;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadHistory() {
  const data = await getJSON("egs/history.json");
  return data ?? { series: {} };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const scrapeKey = process.env.SCRAPINGBEE_API_KEY;
    if (!scrapeKey) return res.status(500).json({ error: "SCRAPINGBEE_API_KEY not configured" });

    const scrapeUrl =
      `https://app.scrapingbee.com/api/v1/?api_key=${scrapeKey}&url=${encodeURIComponent(URL)}` +
      "&premium_proxy=true&render_js=false";
    const scrapeResp = await fetch(scrapeUrl, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "es,en;q=0.9" },
      signal: AbortSignal.timeout(30000),
    });
    if (!scrapeResp.ok) return res.status(502).json({ error: `ScrapingBee HTTP ${scrapeResp.status}` });

    const html = await scrapeResp.text();
    if (html.length < 100_000) {
      return res.status(502).json({ error: "probably blocked" });
    }

    const date = todayIso();
    const parsed = [];
    const seen = new Set();
    for (const m of html.matchAll(COUNTRY_RE)) {
      const iso = m[1].toLowerCase();
      const spanish = m[2].trim();
      const total = parseInt(m[3].replace(/,/g, ""), 10);
      if (seen.has(iso) || !total) continue;
      seen.add(iso);
      parsed.push({ iso, country: EN_NAME[iso] ?? spanish, spanish, total });
    }
    parsed.sort((a, b) => b.total - a.total);
    if (!parsed.length) return res.status(500).json({ error: "parse failed" });

    const history = (await loadHistory()) ?? { series: {} };
    history.series ??= {};
    for (const c of parsed) {
      const arr = history.series[c.iso] ?? [];
      if (arr.length && arr[arr.length - 1].date === date) {
        arr[arr.length - 1] = { date, total: c.total };
      } else {
        arr.push({ date, total: c.total });
      }
      history.series[c.iso] = arr;
    }
    history.lastRefresh = date;
    history.countriesCount = parsed.length;

    const countries = parsed.map((c) => {
      const trend = (history.series[c.iso] ?? []).slice(-TREND_POINTS);
      const prev = trend.length >= 2 ? trend[trend.length - 2].total : null;
      const delta = prev != null ? c.total - prev : null;
      const deltaPct = prev ? Math.round((delta / prev) * 1000) / 10 : null;
      const countPer100kRef = REF_POP[c.iso]
        ? Math.round(((c.total / (REF_POP[c.iso] * 1_000_000)) * 100_000) * 100) / 100
        : null;
      return {
        iso: c.iso,
        country: c.country,
        spanish: c.spanish,
        total: c.total,
        prev,
        delta,
        deltaPct,
        trend,
        cities: [],
        countPer100kRef,
      };
    });

    const totalWorldwide = countries.reduce((sum, c) => sum + c.total, 0);
    const snapshot = {
      source: "eurogirlsescort.es",
      fetchedAt: new Date().toISOString(),
      snapshotDate: date,
      totalWorldwide,
      countriesCount: countries.length,
      countries,
      cities: countries.map((c) => ({
        city: c.country,
        count: c.total,
        url: `/escorts/${c.spanish.toLowerCase().replace(/\s+/g, "-")}/`,
        population: REF_POP[c.iso] ?? null,
        countPer100k: c.countPer100kRef,
        iso: c.iso,
        country: c.country,
      })),
    };

    await Promise.all([
      putJSON("egs/snapshot.json", snapshot),
      putJSON("egs/history.json", history),
    ]);

    return res.status(200).json({
      ok: true,
      countries: countries.length,
      totalWorldwide,
      fetchedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
