const CITIES = [
  { city: "London", slug: "uk/escorts/london", pop: 9.5, iso: "gb", country: "United Kingdom" },
  { city: "Manchester", slug: "uk/escorts/north-west/manchester", pop: 2.7, iso: "gb", country: "United Kingdom" },
  { city: "Birmingham", slug: "uk/escorts/west-midlands/birmingham", pop: 2.6, iso: "gb", country: "United Kingdom" },
  { city: "Edinburgh", slug: "uk/escorts/scotland/edinburgh", pop: 0.9, iso: "gb", country: "United Kingdom" },
  { city: "Glasgow", slug: "uk/escorts/scotland/glasgow", pop: 1.7, iso: "gb", country: "United Kingdom" },
  { city: "Leeds", slug: "uk/escorts/yorkshire-the-humber/leeds", pop: 2.0, iso: "gb", country: "United Kingdom" },
  { city: "Bristol", slug: "uk/escorts/south-west/bristol", pop: 0.7, iso: "gb", country: "United Kingdom" },
  { city: "Cardiff", slug: "uk/escorts/wales/cardiff", pop: 0.5, iso: "gb", country: "United Kingdom" },
  { city: "Brighton", slug: "uk/escorts/south-east-england/brighton", pop: 0.3, iso: "gb", country: "United Kingdom" },
  { city: "Nottingham", slug: "uk/escorts/east-midlands/nottingham", pop: 0.8, iso: "gb", country: "United Kingdom" },
  { city: "New York", slug: "us/escorts/new-york/new-york-city", pop: 19.5, iso: "us", country: "United States" },
  { city: "Los Angeles", slug: "us/escorts/california/los-angeles", pop: 13.2, iso: "us", country: "United States" },
  { city: "Las Vegas", slug: "us/escorts/nevada/las-vegas", pop: 2.8, iso: "us", country: "United States" },
  { city: "Miami", slug: "us/escorts/florida/miami", pop: 6.2, iso: "us", country: "United States" },
  { city: "Chicago", slug: "us/escorts/illinois/chicago", pop: 9.5, iso: "us", country: "United States" },
  { city: "Houston", slug: "us/escorts/texas/houston", pop: 7.3, iso: "us", country: "United States" },
  { city: "Dallas", slug: "us/escorts/texas/dallas", pop: 7.7, iso: "us", country: "United States" },
  { city: "Atlanta", slug: "us/escorts/georgia/atlanta", pop: 6.1, iso: "us", country: "United States" },
  { city: "San Francisco", slug: "us/escorts/california/san-francisco", pop: 4.7, iso: "us", country: "United States" },
  { city: "Seattle", slug: "us/escorts/washington/seattle", pop: 4.0, iso: "us", country: "United States" },
  { city: "Boston", slug: "us/escorts/massachusetts/boston", pop: 4.9, iso: "us", country: "United States" },
  { city: "Washington DC", slug: "us/escorts/district-of-columbia/washington", pop: 6.3, iso: "us", country: "United States" },
  { city: "Toronto", slug: "ca/escorts/ontario/toronto", pop: 6.2, iso: "ca", country: "Canada" },
  { city: "Montreal", slug: "ca/escorts/quebec/montreal", pop: 4.3, iso: "ca", country: "Canada" },
  { city: "Vancouver", slug: "ca/escorts/british-columbia/vancouver", pop: 2.6, iso: "ca", country: "Canada" },
  { city: "Sydney", slug: "au/escorts/new-south-wales/sydney", pop: 5.3, iso: "au", country: "Australia" },
  { city: "Melbourne", slug: "au/escorts/victoria/melbourne", pop: 5.0, iso: "au", country: "Australia" },
  { city: "Brisbane", slug: "au/escorts/queensland/brisbane", pop: 2.6, iso: "au", country: "Australia" },
  { city: "Perth", slug: "au/escorts/western-australia/perth", pop: 2.1, iso: "au", country: "Australia" },
  { city: "Auckland", slug: "nz/escorts/auckland/auckland", pop: 1.7, iso: "nz", country: "New Zealand" },
  { city: "Paris", slug: "fr/escorts/ile-de-france/paris", pop: 11.1, iso: "fr", country: "France" },
  { city: "Berlin", slug: "de/escorts/berlin/berlin", pop: 3.6, iso: "de", country: "Germany" },
  { city: "Munich", slug: "de/escorts/bavaria/munich", pop: 1.5, iso: "de", country: "Germany" },
  { city: "Madrid", slug: "es/escorts/madrid/madrid", pop: 6.7, iso: "es", country: "Spain" },
  { city: "Barcelona", slug: "es/escorts/catalonia/barcelona", pop: 5.6, iso: "es", country: "Spain" },
  { city: "Rome", slug: "it/escorts/lazio/rome", pop: 4.3, iso: "it", country: "Italy" },
  { city: "Milan", slug: "it/escorts/lombardy/milan", pop: 3.1, iso: "it", country: "Italy" },
  { city: "Dublin", slug: "ie/escorts/leinster/dublin", pop: 2.0, iso: "ie", country: "Ireland" },
  { city: "Amsterdam", slug: "nl/escorts/north-holland/amsterdam", pop: 1.1, iso: "nl", country: "Netherlands" },
  { city: "Zurich", slug: "ch/escorts/zurich/zurich", pop: 1.4, iso: "ch", country: "Switzerland" },
  { city: "Dubai", slug: "ae/escorts/dubai/dubai", pop: 3.5, iso: "ae", country: "United Arab Emirates" },
  { city: "Singapore", slug: "sg/escorts/central-region/singapore", pop: 5.9, iso: "sg", country: "Singapore" },
  { city: "Hong Kong", slug: "hk/escorts/hong-kong/hong-kong", pop: 7.5, iso: "hk", country: "Hong Kong" },
  { city: "Tokyo", slug: "jp/escorts/tokyo/tokyo", pop: 37.4, iso: "jp", country: "Japan" },
  { city: "Seoul", slug: "kr/escorts/seoul/seoul", pop: 9.9, iso: "kr", country: "South Korea" },
  { city: "Bangkok", slug: "th/escorts/bangkok/bangkok", pop: 10.5, iso: "th", country: "Thailand" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE = "https://tryst.link";
const CONCURRENCY = 4;
const PROFILE_RE = /href="\/escort\/([^"\/?#]+)"/gi;
const META_COUNT_RE = /Browse\s+([\d,]+)\s+verified\s+escorts/i;

let rateLimited = false;

function countProfiles(html) {
  const seen = new Set();
  for (const match of html.matchAll(PROFILE_RE)) seen.add(match[1]);
  return seen.size;
}

async function fetchCityCount(entry) {
  if (rateLimited) return { ...entry, count: null };
  try {
    const resp = await fetch(`${BASE}/${entry.slug}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 429) { rateLimited = true; return { ...entry, count: null }; }
    if (!resp.ok) return { ...entry, count: null };
    const html = await resp.text();
    const metaMatch = html.match(META_COUNT_RE);
    if (metaMatch) {
      return { ...entry, count: parseInt(metaMatch[1].replace(/,/g, ""), 10) };
    }
    const pageCount = countProfiles(html);
    return { ...entry, count: pageCount || null };
  } catch {
    return { ...entry, count: null };
  }
}

async function fetchAllWithLimit(items) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = { status: "fulfilled", value: await fetchCityCount(items[i]) }; }
      catch (e) { results[i] = { status: "rejected", reason: e }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

export default async function handler(req, res) {
  rateLimited = false;
  try {
    const results = await fetchAllWithLimit(CITIES);

    const cities = results
      .filter((r) => r.status === "fulfilled" && r.value.count != null)
      .map((r) => {
        const { city, count, slug, pop, iso, country } = r.value;
        const population = pop;
        const countPer100k = population ? Math.round(((count / (population * 1_000_000)) * 100_000) * 100) / 100 : null;
        return { city, count, url: `/${slug}`, population, countPer100k, iso, country };
      })
      .sort((a, b) => b.count - a.count);

    const totalWorldwide = cities.reduce((sum, city) => sum + city.count, 0);

    const countryMap = new Map();
    for (const city of cities) {
      if (!city.iso) continue;
      const entry = countryMap.get(city.iso) ?? {
        iso: city.iso,
        country: city.country,
        total: 0,
        cities: [],
      };
      entry.total += city.count;
      entry.cities.push({ city: city.city, count: city.count, countPer100k: city.countPer100k });
      countryMap.set(city.iso, entry);
    }

    const countries = [...countryMap.values()]
      .map((entry) => ({
        ...entry,
        cities: entry.cities.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

    return res.status(200).json({
      source: "tryst.link",
      fetchedAt: new Date().toISOString(),
      totalWorldwide,
      cities,
      countries,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, cities: [] });
  }
}
