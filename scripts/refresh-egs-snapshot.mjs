#!/usr/bin/env node
// Fetches eurogirlsescort.es homepage once and parses the country sidebar
// (~55 countries + pre-aggregated listing counts) into public/data/egs-snapshot.json.
//
// Why a local script instead of /api/egs: Vercel's us-east egress IPs hit a
// Cloudflare "Just a moment…" challenge on egs. Residential IPs pass. So we
// scrape from here, commit the JSON, and serve it statically from the app.
//
// Usage: npm run refresh-egs
//        (or: node scripts/refresh-egs-snapshot.mjs)

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL = "https://www.eurogirlsescort.es/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// flag-icon-XX + country text + <small>(N)</small>
const COUNTRY_RE =
  /flag-icon flag-icon-([a-z]{2})"><\/span>\s*([^<]+?)\s*<\/a>\s*<small>\(([\d,]+)\)<\/small>/g;

// Approximate metro population (millions) for a representative city per country.
// Drives the /100k derivation in the tooltip. Keyed by ISO.
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

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(__dirname, "../data/egs-snapshot.json");

  process.stdout.write(`Fetching ${URL}… `);
  const t0 = Date.now();
  const resp = await fetch(URL, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "es,en;q=0.9" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    console.error(`\nFAILED: HTTP ${resp.status}. Body title: ${(await resp.text()).slice(0, 120)}`);
    process.exit(1);
  }
  const html = await resp.text();
  console.log(`${resp.status} ${html.length.toLocaleString()} bytes in ${Date.now() - t0}ms`);

  const countries = [];
  const seen = new Set();
  for (const m of html.matchAll(COUNTRY_RE)) {
    const iso = m[1].toLowerCase();
    const country = m[2].trim();
    const total = parseInt(m[3].replace(/,/g, ""), 10);
    if (seen.has(iso)) continue;
    seen.add(iso);
    if (!total) continue;
    countries.push({
      iso,
      country,
      total,
      cities: [],
      countPer100kRef: REF_POP[iso]
        ? Math.round(((total / (REF_POP[iso] * 1_000_000)) * 100_000) * 100) / 100
        : null,
    });
  }

  countries.sort((a, b) => b.total - a.total);
  const totalWorldwide = countries.reduce((s, c) => s + c.total, 0);

  const snapshot = {
    source: "eurogirlsescort.es",
    fetchedAt: new Date().toISOString(),
    totalWorldwide,
    countriesCount: countries.length,
    countries,
    cities: countries.map((c) => ({
      city: c.country,
      count: c.total,
      url: `/escorts/${c.country.toLowerCase().replace(/\s+/g, "-")}/`,
      population: REF_POP[c.iso] ?? null,
      countPer100k: c.countPer100kRef,
      iso: c.iso,
      country: c.country,
    })),
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(
    `Parsed ${countries.length} countries · totalWorldwide=${totalWorldwide.toLocaleString()}`
  );
  console.log(`Top 10:`);
  for (const c of countries.slice(0, 10)) {
    console.log(`  ${c.iso.toUpperCase()} ${c.country.padEnd(22)} ${String(c.total).padStart(6)}`);
  }
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
