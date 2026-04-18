// Tryst.link — country-level escort counts.
// Scope (locked 2026-04-18): gaps-only supplement for escortdirectory.com.
// 14 ISO codes that escortdirectory misses, used in the cascade when egs
// (primary) fails. See project-macro-terminal.md and plan Enh #1.

const GAP_ISOS = [
  "us", "mx", "jp", "kr", "th", "ph",
  "sg", "au", "nz", "fr", "it", "ie",
  "fi", "br",
];

const COUNTRY_NAMES = {
  us: "United States",
  mx: "Mexico",
  jp: "Japan",
  kr: "South Korea",
  th: "Thailand",
  ph: "Philippines",
  sg: "Singapore",
  au: "Australia",
  nz: "New Zealand",
  fr: "France",
  it: "Italy",
  ie: "Ireland",
  fi: "Finland",
  br: "Brazil",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://tryst.link";
const META_RE = /Browse\s+([\d,]+)\s+verified\s+escorts/i;
const PROFILE_RE = /href="\/escort\/([^"\/?#]+)"/gi;
const CONCURRENCY = 4;

let rateLimited = false;

function parseCount(html) {
  const meta = html.match(META_RE);
  if (meta) return parseInt(meta[1].replace(/,/g, ""), 10);
  const seen = new Set();
  for (const m of html.matchAll(PROFILE_RE)) seen.add(m[1]);
  return seen.size || null;
}

async function fetchCountry(iso) {
  if (rateLimited) return { iso, total: null };
  try {
    const resp = await fetch(`${BASE}/${iso}/escorts`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 429) { rateLimited = true; return { iso, total: null }; }
    if (!resp.ok) return { iso, total: null };
    const html = await resp.text();
    return { iso, total: parseCount(html) };
  } catch {
    return { iso, total: null };
  }
}

async function fetchAllWithLimit(items) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = { status: "fulfilled", value: await fetchCountry(items[i]) }; }
      catch (e) { results[i] = { status: "rejected", reason: e }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

export default async function handler(req, res) {
  rateLimited = false;
  try {
    const results = await fetchAllWithLimit(GAP_ISOS);
    const countries = results
      .filter((r) => r.status === "fulfilled" && r.value.total != null)
      .map((r) => ({
        iso: r.value.iso,
        country: COUNTRY_NAMES[r.value.iso] ?? r.value.iso.toUpperCase(),
        total: r.value.total,
        cities: [],
      }))
      .sort((a, b) => b.total - a.total);

    const totalWorldwide = countries.reduce((s, c) => s + c.total, 0);

    // Weekly cadence — matches egs/escortdirectory post-2026-04-18.
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");
    return res.status(200).json({
      source: "tryst.link",
      scope: "gaps-only",
      fetchedAt: new Date().toISOString(),
      totalWorldwide,
      cities: [],
      countries,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, cities: [], countries: [] });
  }
}
