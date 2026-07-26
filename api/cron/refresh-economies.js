// Weekly refresh for the Economies tab.
// IMF endpoints are fetched in multi-country batches; OECD endpoints must be
// fetched one country at a time because multi-country keys drop observations.

import { getJSON, putJSON } from "../../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "economies/snapshot.json";
// Accept-Language is required: without it, sdmx.oecd.org returns HTTP 500
// ("languageTag1") for a subset of country keys (AUS/AUT/BEL..., verified 2026-07-26).
const USER_AGENT = { "User-Agent": "macro-signal-research/1.0", "Accept-Language": "en" };
const SOURCES = [
  "OECD SDMX (QNA, LFS)",
  "IMF SDMX 2.1 (NA_MAIN, LS, ITG)",
];

const OECD = "AUS AUT BEL CAN CHE CHL COL CRI CZE DEU DNK ESP EST FIN FRA GBR GRC HUN IRL ISL ISR ITA JPN KOR LTU LUX LVA MEX NLD NOR NZL POL PRT SVK SVN SWE TUR USA".split(" ");
const ASEAN = "IDN MYS THA PHL VNM SGP MMR KHM LAO BRN".split(" ");
const AFRICA = "ZAF NGA EGY KEN MAR GHA ETH CIV TZA DZA TUN SEN".split(" ");
const MAJORS = "CHN IND BRA RUS SAU ARG".split(" ");
const ALL = [...OECD, ...ASEAN, ...AFRICA, ...MAJORS];

const NAMES = {
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  CAN: "Canada",
  CHE: "Switzerland",
  CHL: "Chile",
  COL: "Colombia",
  CRI: "Costa Rica",
  CZE: "Czechia",
  DEU: "Germany",
  DNK: "Denmark",
  ESP: "Spain",
  EST: "Estonia",
  FIN: "Finland",
  FRA: "France",
  GBR: "United Kingdom",
  GRC: "Greece",
  HUN: "Hungary",
  IRL: "Ireland",
  ISL: "Iceland",
  ISR: "Israel",
  ITA: "Italy",
  JPN: "Japan",
  KOR: "South Korea",
  LTU: "Lithuania",
  LUX: "Luxembourg",
  LVA: "Latvia",
  MEX: "Mexico",
  NLD: "Netherlands",
  NOR: "Norway",
  NZL: "New Zealand",
  POL: "Poland",
  PRT: "Portugal",
  SVK: "Slovakia",
  SVN: "Slovenia",
  SWE: "Sweden",
  TUR: "Türkiye",
  USA: "United States",
  IDN: "Indonesia",
  MYS: "Malaysia",
  THA: "Thailand",
  PHL: "Philippines",
  VNM: "Vietnam",
  SGP: "Singapore",
  MMR: "Myanmar",
  KHM: "Cambodia",
  LAO: "Laos",
  BRN: "Brunei",
  ZAF: "South Africa",
  NGA: "Nigeria",
  EGY: "Egypt",
  KEN: "Kenya",
  MAR: "Morocco",
  GHA: "Ghana",
  ETH: "Ethiopia",
  CIV: "Côte d'Ivoire",
  TZA: "Tanzania",
  DZA: "Algeria",
  TUN: "Tunisia",
  SEN: "Senegal",
  CHN: "China",
  IND: "India",
  BRA: "Brazil",
  RUS: "Russia",
  SAU: "Saudi Arabia",
  ARG: "Argentina",
};

const BLOC = Object.fromEntries([
  ...OECD.map((country) => [country, "OECD"]),
  ...ASEAN.map((country) => [country, "ASEAN"]),
  ...AFRICA.map((country) => [country, "AFRICA"]),
  ...MAJORS.map((country) => [country, "MAJORS"]),
]);

const ISO2 = {
  VNM: "VN",
  THA: "TH",
  PHL: "PH",
  MYS: "MY",
  SGP: "SG",
  MMR: "MM",
  KHM: "KH",
  LAO: "LA",
  BRN: "BN",
  NGA: "NG",
  EGY: "EG",
  KEN: "KE",
  MAR: "MA",
  GHA: "GH",
  ETH: "ET",
  CIV: "CI",
  TZA: "TZ",
  DZA: "DZ",
  TUN: "TN",
  SEN: "SN",
};
const ISO2R = Object.fromEntries(Object.entries(ISO2).map(([iso3, iso2]) => [iso2, iso3]));
const OECD_QNA_AREAS = [...OECD, "IDN", "CHN", "IND", "BRA", "ZAF", "SAU", "RUS", "ARG"];

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value, digits) {
  return Number(Number(value).toFixed(digits));
}

function qsort(observations) {
  return observations.sort((a, b) => a.p.localeCompare(b.p));
}

function emptyCountries() {
  return Object.fromEntries(
    ALL.map((country) => [
      country,
      {
        name: NAMES[country],
        bloc: BLOC[country],
        gdp: [],
        unemp: [],
        trade: [],
        src: {},
      },
    ])
  );
}

function priorCountries(snapshot) {
  const countries = emptyCountries();
  for (const country of ALL) {
    const previous = snapshot?.countries?.[country];
    if (!previous) continue;
    for (const metric of ["gdp", "unemp", "trade"]) {
      if (Array.isArray(previous[metric])) countries[country][metric] = previous[metric];
      if (previous.src?.[metric]) countries[country].src[metric] = previous.src[metric];
    }
    if (previous.weo) countries[country].weo = previous.weo;
  }
  return countries;
}

function coverageOf(countries) {
  return {
    gdp: ALL.filter((country) => countries[country].gdp.length > 0).length,
    unemp: ALL.filter((country) => countries[country].unemp.length > 0).length,
    trade: ALL.filter((country) => countries[country].trade.length > 0).length,
  };
}

function mergeNeverDegrade(previous, fresh) {
  for (const country of ALL) {
    for (const metric of ["gdp", "unemp", "trade"]) {
      const candidate = fresh[country][metric];
      const stored = previous[country][metric];
      if (candidate.length > 0 && candidate.length >= stored.length) {
        previous[country][metric] = candidate;
        if (fresh[country].src[metric]) {
          previous[country].src[metric] = fresh[country].src[metric];
        }
      }
    }
    if (fresh[country].weo && Object.keys(fresh[country].weo).length > 0) {
      previous[country].weo = fresh[country].weo;
    }
  }
  return previous;
}

function attribute(attrs, name) {
  return attrs.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? null;
}

function xmlSeries(raw) {
  return raw.matchAll(/<Series ([^>]+)>(.*?)<\/Series>/gs);
}

function xmlObservations(body) {
  return [...body.matchAll(/TIME_PERIOD="([^"]+)" OBS_VALUE="([^"]+)"/g)]
    .map((match) => [match[1], Number(match[2])])
    .filter(([, value]) => Number.isFinite(value));
}

async function fetchOnce(url, timeout = 60_000) {
  const response = await fetch(url, {
    headers: USER_AGENT,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new HttpError(response.status, url);
  return response.text();
}

async function fetchImf(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      if ((err?.status === 429 || err?.status === 503) && attempt < 3) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`IMF request exhausted retries: ${url}`);
}

function createOecdFetcher() {
  let lastCallFinishedAt = 0;
  return async function fetchOecd(url) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const waitForSpacing = Math.max(0, 1_200 - (Date.now() - lastCallFinishedAt));
      if (waitForSpacing > 0) await sleep(waitForSpacing);
      try {
        try {
          return await fetchOnce(url, 45_000);
        } finally {
          lastCallFinishedAt = Date.now();
        }
      } catch (err) {
        if ((err?.status === 429 || err?.status === 503) && attempt < 3) {
          const backoff = 10_000 * (2 ** attempt);
          console.warn(`OECD ${err.status}; backing off ${backoff / 1_000}s`);
          await sleep(backoff);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`OECD request exhausted retries: ${url}`);
  };
}

async function fetchImfUnemployment(countries) {
  let need = [...ALL];
  for (const freq of ["Q", "M"]) {
    if (need.length === 0) break;
    try {
      const key = need.join("+");
      const raw = await fetchImf(
        `https://api.imf.org/external/sdmx/2.1/data/LS/${key}.U.PT.${freq}?startPeriod=2024-01`
      );
      for (const match of xmlSeries(raw)) {
        const country = attribute(match[1], "COUNTRY");
        if (!countries[country] || countries[country].unemp.length > 0) continue;
        const pairs = xmlObservations(match[2]);
        let observations;
        if (freq === "Q") {
          observations = qsort(pairs.map(([p, value]) => ({ p, v: round(value, 1) })));
        } else {
          const byQuarter = new Map();
          for (const [period, value] of pairs) {
            const [year, month] = period.split("-M");
            if (!year || !month) continue;
            const quarter = `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
            if (!byQuarter.has(quarter)) byQuarter.set(quarter, []);
            byQuarter.get(quarter).push(value);
          }
          observations = qsort(
            [...byQuarter].map(([p, values]) => ({
              p,
              v: round(values.reduce((sum, value) => sum + value, 0) / values.length, 1),
            }))
          );
        }
        if (observations.length > 0) {
          countries[country].unemp = observations;
          countries[country].src.unemp = `IMF LS ${freq}`;
        }
      }
      need = ALL.filter((country) => countries[country].unemp.length === 0);
      console.log(`IMF LS ${freq}: ${need.length} countries still missing`);
    } catch (err) {
      console.error(`IMF LS ${freq} failed:`, err?.message ?? err);
    }
  }
}

async function fetchImfGdp(countries) {
  const need = ALL.filter((country) => BLOC[country] !== "OECD" && ISO2[country]);
  if (need.length === 0) return;

  const dimensions = [
    "FREQ",
    "ADJUSTMENT",
    "REF_AREA",
    "COUNTERPART_AREA",
    "REF_SECTOR",
    "COUNTERPART_SECTOR",
    "ACCOUNTING_ENTRY",
    "STO",
    "INSTR_ASSET",
    "ACTIVITY",
    "EXPENDITURE",
    "UNIT_MEASURE",
    "PRICES",
    "TRANSFORMATION",
  ];
  const values = Object.fromEntries(dimensions.map((dimension) => [dimension, ""]));
  Object.assign(values, {
    FREQ: "Q",
    REF_AREA: need.map((country) => ISO2[country]).join("+"),
    STO: "B1GQ",
    PRICES: "Q",
  });
  const key = dimensions.map((dimension) => values[dimension]).join(".");

  try {
    const raw = await fetchImf(
      `https://api.imf.org/external/sdmx/2.1/data/NA_MAIN/${key}?startPeriod=2023-01`
    );
    const best = new Map();
    for (const match of xmlSeries(raw)) {
      const iso3 = ISO2R[attribute(match[1], "REF_AREA")];
      if (!iso3) continue;
      const seasonallyAdjusted = attribute(match[1], "ADJUSTMENT") === "Y";
      const pairs = xmlObservations(match[2]).sort((a, b) => a[0].localeCompare(b[0]));
      const current = best.get(iso3);
      if (
        !current ||
        (seasonallyAdjusted && !current.seasonallyAdjusted) ||
        (seasonallyAdjusted === current.seasonallyAdjusted && pairs.length > current.pairs.length)
      ) {
        best.set(iso3, { seasonallyAdjusted, pairs });
      }
    }

    for (const [country, { seasonallyAdjusted, pairs }] of best) {
      const levelByPeriod = new Map(pairs);
      const observations = [];
      for (let index = 0; index < pairs.length; index += 1) {
        const [period, value] = pairs[index];
        if (seasonallyAdjusted && index >= 1) {
          const previous = pairs[index - 1][1];
          if (previous !== 0) {
            observations.push({ p: period, v: round((value / previous - 1) * 100, 2) });
          }
        } else if (!seasonallyAdjusted) {
          const [year, quarter] = period.split("-Q");
          const previous = levelByPeriod.get(`${Number(year) - 1}-Q${quarter}`);
          if (previous) {
            observations.push({ p: period, v: round((value / previous - 1) * 100, 2) });
          }
        }
      }
      const recent = qsort(observations.filter((observation) => observation.p >= "2024"));
      if (recent.length > 0) {
        countries[country].gdp = recent;
        countries[country].src.gdp = `IMF NA_MAIN ${seasonallyAdjusted ? "QoQ sa" : "YoY nsa"}`;
      }
    }
  } catch (err) {
    console.error("IMF NA_MAIN failed:", err?.message ?? err);
  }
}

async function fetchImfTrade(countries) {
  const chunks = [];
  for (let index = 0; index < ALL.length; index += 35) {
    chunks.push(ALL.slice(index, index + 35));
  }

  for (const chunk of chunks) {
    try {
      const raw = await fetchImf(
        `https://api.imf.org/external/sdmx/2.1/data/ITG/${chunk.join("+")}.XG.FOB_USD.M?startPeriod=2023-01`
      );
      for (const match of xmlSeries(raw)) {
        const country = attribute(match[1], "COUNTRY");
        if (!countries[country] || countries[country].trade.length > 0) continue;
        const byQuarter = new Map();
        for (const [period, value] of xmlObservations(match[2])) {
          const [year, month] = period.split("-M");
          if (!year || !month) continue;
          const quarter = `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
          if (!byQuarter.has(quarter)) byQuarter.set(quarter, []);
          byQuarter.get(quarter).push(value);
        }
        const quarterlyTotals = new Map(
          [...byQuarter]
            .sort(([a], [b]) => a.localeCompare(b))
            .filter(([, values]) => values.length === 3)
            .map(([quarter, values]) => [
              quarter,
              values.reduce((sum, value) => sum + value, 0),
            ])
        );
        const observations = [];
        for (const [period, total] of quarterlyTotals) {
          const [year, quarter] = period.split("-Q");
          const previous = quarterlyTotals.get(`${Number(year) - 1}-Q${quarter}`);
          if (previous) {
            observations.push({
              p: period,
              v: round((total / previous - 1) * 100, 1),
              usd: round(total / 1e9, 1),
            });
          }
        }
        if (observations.length > 0) {
          countries[country].trade = qsort(observations);
          countries[country].src.trade = "IMF ITG exports FOB USD, qtr sum YoY";
        }
      }
    } catch (err) {
      console.error(`IMF ITG chunk ${chunk[0]}-${chunk.at(-1)} failed:`, err?.message ?? err);
    }
  }
}

// IMF WEO annual + forecast — fallback layer for countries that publish no
// (or heavily lagged) quarterly data. Key format {COUNTRY}.{INDICATOR}.A;
// NGDP_RPCH = real GDP growth %, LUR = unemployment rate %.
async function fetchImfWeo(countries) {
  const currentYear = new Date().getUTCFullYear();
  try {
    const raw = await fetchImf(
      `https://api.imf.org/external/sdmx/2.1/data/WEO/${ALL.join("+")}.NGDP_RPCH+LUR.A?startPeriod=2024`
    );
    for (const match of xmlSeries(raw)) {
      const country = attribute(match[1], "COUNTRY");
      const indicator = attribute(match[1], "INDICATOR");
      if (!countries[country]) continue;
      const metric = indicator === "NGDP_RPCH" ? "gdp" : indicator === "LUR" ? "unemp" : null;
      if (!metric) continue;
      const observations = qsort(
        xmlObservations(match[2]).map(([p, value]) => ({
          p,
          v: round(value, 1),
          ...(Number(p) >= currentYear ? { forecast: true } : {}),
        }))
      ).slice(0, 4);
      if (observations.length > 0) {
        if (!countries[country].weo) countries[country].weo = {};
        countries[country].weo[metric] = observations;
      }
    }
  } catch (err) {
    console.error("IMF WEO failed:", err?.message ?? err);
  }
}

function parseOecdGdp(raw) {
  const data = JSON.parse(raw).data;
  const dataSet = data.dataSets[0];
  const periods = data.structures[0].dimensions.observation[0].values.map((value) => value.id);
  let best = [];
  for (const series of Object.values(dataSet.series ?? {})) {
    const observations = qsort(
      Object.entries(series.observations ?? {})
        .filter(([, value]) => value && value[0] !== null && value[0] !== undefined)
        .map(([index, value]) => ({ p: periods[Number(index)], v: round(value[0], 2) }))
        .filter((observation) => observation.p)
    );
    if (observations.length > best.length) best = observations;
  }
  return best;
}

function parseOecdUnemployment(raw) {
  const data = JSON.parse(raw).data;
  const dataSet = data.dataSets[0];
  const periods = data.structures[0].dimensions.observation[0].values.map((value) => value.id);
  let best = [];
  for (const series of Object.values(dataSet.series ?? {})) {
    const byQuarter = new Map();
    for (const [index, value] of Object.entries(series.observations ?? {})) {
      if (!value || value[0] === null || value[0] === undefined) continue;
      const [year, month] = periods[Number(index)]?.split("-") ?? [];
      if (!year || !month) continue;
      const quarter = `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
      if (!byQuarter.has(quarter)) byQuarter.set(quarter, []);
      byQuarter.get(quarter).push(Number(value[0]));
    }
    const observations = qsort(
      [...byQuarter].map(([p, values]) => ({
        p,
        v: round(values.reduce((sum, value) => sum + value, 0) / values.length, 1),
      }))
    );
    if (observations.length > best.length) best = observations;
  }
  return best;
}

// The OECD rate limiter allows roughly ONE ~46-call phase per cooldown window
// (verified 2026-07-26: 46 GDP calls succeeded, the unemployment phase that
// followed immediately got 429-stormed). GDP and unemployment therefore run as
// SEPARATE scheduled invocations (?part=oecd-gdp / ?part=oecd-unemp) two hours
// apart; merge-never-degrade makes partial runs safe.
function createOecdPhaseRunner() {
  const fetchOecd = createOecdFetcher();
  let consecutiveFailures = 0;
  let aborted = false;

  async function countryCall(label, country, url, parse, apply) {
    if (aborted) return;
    try {
      const raw = await fetchOecd(url);
      const observations = parse(raw);
      apply(observations);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      console.error(`OECD ${label} ${country} failed:`, err?.message ?? err);
      if (consecutiveFailures >= 3) {
        aborted = true;
        console.error(
          `OECD phase aborted after 3 consecutive failed countries; keeping all data fetched so far`
        );
      }
    }
  }

  return { countryCall, isAborted: () => aborted };
}

async function fetchOecdGdp(countries, runner) {
  for (const area of OECD_QNA_AREAS) {
    await runner.countryCall(
      "GDP",
      area,
      `https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA,1.1/Q..${area}.S1..B1GQ......G1.?startPeriod=2024-Q1&dimensionAtObservation=TIME_PERIOD&format=jsondata`,
      parseOecdGdp,
      (observations) => {
        if (observations.length > countries[area].gdp.length) {
          countries[area].gdp = observations;
          countries[area].src.gdp = "OECD QNA QoQ sa";
        }
      }
    );
    if (runner.isAborted()) return;
  }
}

async function fetchOecdUnemployment(countries, runner) {
  for (const area of OECD) {
    await runner.countryCall(
      "unemployment",
      area,
      `https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,1.0/${area}..._Z.Y._T.Y_GE15..M?startPeriod=2024-01&dimensionAtObservation=TIME_PERIOD&format=jsondata`,
      parseOecdUnemployment,
      (observations) => {
        if (observations.length >= 4) {
          countries[area].unemp = observations;
          countries[area].src.unemp = "OECD harmonised, quarterly avg of monthly";
        }
      }
    );
    if (runner.isAborted()) return;
  }
}

function queryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const startedAt = Date.now();
    const requestedPart = queryValue(req.query?.part) ?? "";
    const dry = queryValue(req.query?.dry) === "1";
    if (!["", "imf", "oecd", "oecd-gdp", "oecd-unemp"].includes(requestedPart)) {
      return res.status(400).json({ error: "part must be imf, oecd, oecd-gdp or oecd-unemp" });
    }

    const prior = await getJSON(BLOB_PATH);
    const priorData = priorCountries(prior);
    const priorCoverage = coverageOf(priorData);
    const fresh = emptyCountries();

    if (requestedPart === "" || requestedPart === "imf") {
      await fetchImfUnemployment(fresh);
      await fetchImfGdp(fresh);
      await fetchImfTrade(fresh);
      await fetchImfWeo(fresh);
    }
    // Default run covers IMF + OECD GDP; OECD unemployment runs as its own
    // scheduled invocation 2h later (rate-limiter allows ~1 OECD phase/window).
    if (["", "oecd", "oecd-gdp"].includes(requestedPart)) {
      const runner = createOecdPhaseRunner();
      await fetchOecdGdp(fresh, runner);
      if (requestedPart === "oecd" && !runner.isAborted()) {
        await fetchOecdUnemployment(fresh, runner);
      }
    }
    if (requestedPart === "oecd-unemp") {
      await fetchOecdUnemployment(fresh, createOecdPhaseRunner());
    }

    const countries = mergeNeverDegrade(priorData, fresh);
    const coverage = coverageOf(countries);
    const degraded = ["gdp", "unemp", "trade"].filter(
      (metric) => coverage[metric] < priorCoverage[metric]
    );
    if (degraded.length > 0) {
      throw new Error(`Refusing degraded economies snapshot: ${degraded.join(", ")}`);
    }

    if (!dry) {
      if (!prior && coverage.gdp + coverage.unemp + coverage.trade === 0) {
        throw new Error("Refusing to seed an empty economies snapshot");
      }
      await putJSON(BLOB_PATH, {
        meta: {
          fetchedAt: new Date().toISOString(),
          sources: SOURCES,
          coverage,
        },
        countries,
      });
    }

    return res.status(200).json({
      ok: true,
      coverage,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      details: err?.cause?.message ?? null,
    });
  }
}
