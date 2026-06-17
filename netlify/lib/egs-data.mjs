// egs-data.mjs
// Shared logic for the eurogirlsescort country-count signal, used by both the
// weekly Netlify cron (api/cron/refresh-egs.js) and the one-shot local
// revive+backfill script (scripts/refresh-egs-firecrawl.mjs) so they emit
// byte-identical snapshot/history shapes.

// Matches the country sidebar rows: flag span + Spanish name + (count).
export const COUNTRY_RE =
  /flag-icon flag-icon-([a-z]{2})"><\/span>\s*([^<]+?)\s*<\/a>\s*<small>\(([\d,]+)\)<\/small>/g;

export const EN_NAME = {
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

// Adult-population (millions, 18+) reference for per-100k density.
export const REF_POP = {
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

export const TREND_POINTS = 24;
// MoM reference: latest history point at least this many days older than current.
export const MOM_MIN_DAYS = 28;

/**
 * Parse the country sidebar out of a full eurogirlsescort HTML page.
 * @param {string} html
 * @returns {Array<{iso,country,spanish,total}>} deduped, sorted desc by total
 */
export function extractCounts(html) {
  const parsed = [];
  const seen = new Set();
  for (const m of String(html).matchAll(COUNTRY_RE)) {
    const iso = m[1].toLowerCase();
    const spanish = m[2].trim();
    const total = parseInt(m[3].replace(/,/g, ""), 10);
    if (seen.has(iso) || !total) continue;
    seen.add(iso);
    parsed.push({ iso, country: EN_NAME[iso] ?? spanish, spanish, total });
  }
  parsed.sort((a, b) => b.total - a.total);
  return parsed;
}

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T12:00:00Z`).getTime();
  const b = new Date(`${isoB}T12:00:00Z`).getTime();
  return Math.round(Math.abs(a - b) / 86_400_000);
}

/**
 * Merge a dated set of counts into history.series (one point per iso per date;
 * same-date re-runs overwrite). Mutates and returns history.
 */
export function mergeHistory(history, parsed, date) {
  history.series ??= {};
  for (const c of parsed) {
    const arr = history.series[c.iso] ?? [];
    const existing = arr.findIndex((p) => p.date === date);
    if (existing >= 0) arr[existing] = { date, total: c.total };
    else arr.push({ date, total: c.total });
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    history.series[c.iso] = arr;
  }
  history.lastRefresh = date;
  history.countriesCount = parsed.length;
  return history;
}

// Change windows for the growth/decline views. Each picks the latest history
// point at least `minDays` older than now (so monthly data still resolves a
// clean comparison). Keys are consumed by the frontend window-selector.
export const WINDOWS = [
  ["mom", 25],   // ~1 month
  ["q3m", 75],   // ~3 months
  ["h6m", 150],  // ~6 months
  ["yoy", 330],  // ~1 year
];

// Latest series point ≥ minDays older than `date` (series sorted ascending).
function refAtLeast(series, date, minDays) {
  let ref = null;
  for (const p of series) {
    if (p.date >= date) continue;
    if (daysBetween(p.date, date) >= minDays) ref = p;
  }
  return ref;
}

// Signed change of `total` vs the window reference point.
function windowChange(series, total, date, minDays) {
  const ref = refAtLeast(series, date, minDays);
  if (!ref || !ref.total) return { pct: null, delta: null, windowDays: null };
  const delta = total - ref.total;
  return {
    pct: Math.round((delta / ref.total) * 1000) / 10,
    delta,
    windowDays: daysBetween(ref.date, date),
  };
}

function changeSet(series, total, date) {
  const out = {};
  for (const [key, minDays] of WINDOWS) out[key] = windowChange(series, total, date, minDays);
  return out;
}

/**
 * Build the full snapshot from today's parsed counts + the (already-merged)
 * history. Per country: week-over-week delta + a multi-window change set
 * (mom/q3m/h6m/yoy) + trend sparkline. Top-level: worldwide trend series +
 * worldwide change set, for the growth/decline dashboard.
 *
 * @param opts.source / opts.nameMap / opts.popMap let non-EGS callers (tryst)
 *   reuse the same math with their own labels/populations.
 */
export function buildSnapshot(parsed, history, date, opts = {}) {
  const { source = "eurogirlsescort.es", popMap = REF_POP } = opts;

  const countries = parsed.map((c) => {
    const series = history.series[c.iso] ?? [];
    const trend = series.slice(-TREND_POINTS);
    const prev = trend.length >= 2 ? trend[trend.length - 2].total : null;
    const delta = prev != null ? c.total - prev : null;
    const deltaPct = prev ? Math.round((delta / prev) * 1000) / 10 : null;

    const chg = changeSet(series, c.total, date);
    // Back-compat mom* fields (= the mom window) for existing consumers.
    const momDelta = chg.mom.delta;
    const momPct = chg.mom.pct;
    const momWindowDays = chg.mom.windowDays;
    const momPrev = momDelta != null ? c.total - momDelta : null;

    const countPer100kRef = popMap[c.iso]
      ? Math.round((c.total / (popMap[c.iso] * 1_000_000)) * 100_000 * 100) / 100
      : null;

    return {
      iso: c.iso,
      country: c.country,
      spanish: c.spanish,
      total: c.total,
      prev,
      delta,
      deltaPct,
      momPrev,
      momDelta,
      momPct,
      momWindowDays,
      chg,
      trend,
      cities: [],
      countPer100kRef,
    };
  });

  const totalWorldwide = countries.reduce((sum, c) => sum + c.total, 0);

  // Worldwide trend = sum of every country's count at each historical date.
  // Early dates naturally sum fewer countries (the site listed fewer then),
  // which is the true worldwide total at that time.
  const allDates = [
    ...new Set(Object.values(history.series).flatMap((s) => s.map((p) => p.date))),
  ].sort();
  const worldwideTrend = allDates.map((d) => ({
    date: d,
    total: Object.values(history.series).reduce((sum, s) => {
      const p = s.find((x) => x.date === d);
      return sum + (p ? p.total : 0);
    }, 0),
  }));
  const worldwideChanges = changeSet(worldwideTrend, totalWorldwide, date);

  return {
    source,
    fetchedAt: new Date().toISOString(),
    snapshotDate: date,
    totalWorldwide,
    totalWorldwideMoMPct: worldwideChanges.mom.pct, // back-compat
    worldwideChanges,
    worldwideTrend,
    countriesCount: countries.length,
    countries,
    cities: countries.map((c) => ({
      city: c.country,
      count: c.total,
      url: `/escorts/${c.spanish.toLowerCase().replace(/\s+/g, "-")}/`,
      population: popMap[c.iso] ?? null,
      countPer100k: c.countPer100kRef,
      iso: c.iso,
      country: c.country,
    })),
  };
}
