const CITIES = [
  { city: "London", slug: "londres", pop: 9.5, iso: "gb", country: "United Kingdom" },
  { city: "Paris", slug: "paris", pop: 11.1, iso: "fr", country: "France" },
  { city: "Berlin", slug: "berlin", pop: 3.6, iso: "de", country: "Germany" },
  { city: "Hamburg", slug: "hamburgo", pop: 1.9, iso: "de", country: "Germany" },
  { city: "Frankfurt", slug: "francfort", pop: 5.6, iso: "de", country: "Germany" },
  { city: "Madrid", slug: "madrid", pop: 6.7, iso: "es", country: "Spain" },
  { city: "Barcelona", slug: "barcelona", pop: 5.6, iso: "es", country: "Spain" },
  { city: "Amsterdam", slug: "amsterdam", pop: 1.1, iso: "nl", country: "Netherlands" },
  { city: "Zurich", slug: "zurich", pop: 1.4, iso: "ch", country: "Switzerland" },
  { city: "Vienna", slug: "viena", pop: 2.0, iso: "at", country: "Austria" },
  { city: "Warsaw", slug: "varsovia", pop: 1.8, iso: "pl", country: "Poland" },
  { city: "Bucharest", slug: "bucarest", pop: 1.8, iso: "ro", country: "Romania" },
  { city: "Budapest", slug: "budapest", pop: 1.8, iso: "hu", country: "Hungary" },
  { city: "Prague", slug: "praga", pop: 1.3, iso: "cz", country: "Czech Republic" },
  { city: "Sofia", slug: "sofia", pop: 1.7, iso: "bg", country: "Bulgaria" },
  { city: "Moscow", slug: "moscu", pop: 12.6, iso: "ru", country: "Russia" },
  { city: "Istanbul", slug: "istanbul", pop: 15.8, iso: "tr", country: "Turkey" },
  { city: "Athens", slug: "atenas", pop: 3.2, iso: "gr", country: "Greece" },
  { city: "Lisbon", slug: "lisboa", pop: 2.9, iso: "pt", country: "Portugal" },
  { city: "Porto", slug: "oporto", pop: 1.3, iso: "pt", country: "Portugal" },
  { city: "Stockholm", slug: "estocolmo", pop: 1.6, iso: "se", country: "Sweden" },
  { city: "Copenhagen", slug: "copenhague", pop: 1.4, iso: "dk", country: "Denmark" },
  { city: "Oslo", slug: "oslo", pop: 1.1, iso: "no", country: "Norway" },
  { city: "Dubai", slug: "dubai", pop: 3.5, iso: "ae", country: "United Arab Emirates" },
  { city: "Abu Dhabi", slug: "abu-dhabi", pop: 1.5, iso: "ae", country: "United Arab Emirates" },
  { city: "Doha", slug: "doha", pop: 2.0, iso: "qa", country: "Qatar" },
  { city: "Riyadh", slug: "riad", pop: 7.6, iso: "sa", country: "Saudi Arabia" },
  { city: "Tel Aviv", slug: "tel-aviv", pop: 4.3, iso: "il", country: "Israel" },
  { city: "Hong Kong", slug: "hong-kong", pop: 7.5, iso: "hk", country: "Hong Kong" },
  { city: "Singapore", slug: "singapur", pop: 5.9, iso: "sg", country: "Singapore" },
  { city: "Bangkok", slug: "bangkok", pop: 10.5, iso: "th", country: "Thailand" },
  { city: "Tokyo", slug: "tokio", pop: 37.4, iso: "jp", country: "Japan" },
  { city: "Seoul", slug: "seul", pop: 9.9, iso: "kr", country: "South Korea" },
  { city: "Toronto", slug: "toronto", pop: 6.2, iso: "ca", country: "Canada" },
  { city: "Montreal", slug: "montreal", pop: 4.3, iso: "ca", country: "Canada" },
  { city: "Vancouver", slug: "vancouver", pop: 2.6, iso: "ca", country: "Canada" },
  { city: "New York", slug: "nueva-york", pop: 19.5, iso: "us", country: "United States" },
  { city: "Los Angeles", slug: "los-angeles", pop: 13.2, iso: "us", country: "United States" },
  { city: "Miami", slug: "miami", pop: 6.2, iso: "us", country: "United States" },
  { city: "Mexico City", slug: "ciudad-de-mexico", pop: 22.0, iso: "mx", country: "Mexico" },
  { city: "Cancun", slug: "cancun", pop: 1.0, iso: "mx", country: "Mexico" },
  { city: "Bogota", slug: "bogota", pop: 11.3, iso: "co", country: "Colombia" },
  { city: "Caracas", slug: "caracas", pop: 2.9, iso: "ve", country: "Venezuela" },
  { city: "São Paulo", slug: "sao-paulo", pop: 22.0, iso: "br", country: "Brazil" },
  { city: "Rio de Janeiro", slug: "rio-de-janeiro", pop: 13.5, iso: "br", country: "Brazil" },
];

const BASE = "https://www.eurogirlsescort.es";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_SIZE = 50;
const PROFILE_RE = /href=["']\/escort\/[^\/"'?#]+\/\d+\/["']/gi;
const PAGINATOR_RE = /profile-paginator-page=(\d+)/gi;

function countProfiles(html) {
  const matches = html.match(PROFILE_RE) || [];
  return matches.length;
}

function getLastPage(html) {
  const matches = [...html.matchAll(PAGINATOR_RE)];
  if (!matches.length) return 1;
  return Math.max(...matches.map((match) => Number.parseInt(match[1], 10)));
}

function roundCountPer100k(count, pop) {
  if (pop == null) return null;
  return Math.round(((count / (pop * 1_000_000)) * 100_000) * 100) / 100;
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      "Accept-Language": "es,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  return resp.text();
}

async function fetchCityCount(entry) {
  const url = `${BASE}/escorts/${entry.slug}/`;

  try {
    const firstPageHtml = await fetchHtml(url);
    if (!firstPageHtml) return { ...entry, count: null, url };

    const lastPage = getLastPage(firstPageHtml);
    if (lastPage <= 1) {
      return { ...entry, count: countProfiles(firstPageHtml), url };
    }

    const lastPageHtml = await fetchHtml(`${url}?profile-paginator-page=${lastPage}`);
    if (!lastPageHtml) return { ...entry, count: null, url };

    const lastPageCount = countProfiles(lastPageHtml);
    return { ...entry, count: (lastPage - 1) * PAGE_SIZE + lastPageCount, url };
  } catch {
    return { ...entry, count: null, url };
  }
}

const CONCURRENCY = 6;

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
  try {
    const results = await fetchAllWithLimit(CITIES);

    const cities = results
      .filter((result) => result.status === "fulfilled" && result.value.count != null)
      .map((result) => {
        const { city, count, url, pop, iso, country } = result.value;
        return {
          city,
          count,
          url,
          population: pop,
          countPer100k: roundCountPer100k(count, pop),
          iso,
          country,
        };
      })
      .sort((a, b) => b.count - a.count);

    const totalWorldwide = cities.reduce((sum, city) => sum + city.count, 0);
    const countryMap = new Map();

    for (const city of cities) {
      const current = countryMap.get(city.iso) ?? {
        iso: city.iso,
        country: city.country,
        total: 0,
        cities: [],
      };
      current.total += city.count;
      current.cities.push({
        city: city.city,
        count: city.count,
        countPer100k: city.countPer100k,
      });
      countryMap.set(city.iso, current);
    }

    const countries = [...countryMap.values()]
      .map((country) => ({
        ...country,
        cities: country.cities.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

    return res.status(200).json({
      source: "eurogirlsescort.es",
      fetchedAt: new Date().toISOString(),
      totalWorldwide,
      cities,
      countries,
    });
  } catch (err) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({ error: err.message, cities: [] });
  }
}
