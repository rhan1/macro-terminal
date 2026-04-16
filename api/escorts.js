// Scrapes https://www.escortdirectory.com/ for aggregate city-level listing counts.
// Used as an unconventional economic indicator (demand proxy for high-income leisure spending).
// Homepage is geo-localized by IP, so we fetch known city pages directly.

const CITIES = [
  { city: "London",     slug: "escorts-london-54",        pop: 9.5 },
  { city: "Dubai",      slug: "escorts-dubai-145",         pop: 3.5 },
  { city: "Abu Dhabi",  slug: "escorts-abu-dhabi-393",     pop: 1.5 },
  { city: "Warsaw",     slug: "escorts-warsaw-213",        pop: 1.8 },
  { city: "Amsterdam",  slug: "escorts-amsterdam-131",     pop: 1.1 },
  { city: "Doha",       slug: "escorts-doha-445",          pop: 2.0 },
  { city: "Zurich",     slug: "escorts-zurich-241",        pop: 0.4 },
  { city: "Berlin",     slug: "escorts-berlin-194",        pop: 3.6 },
  { city: "Riyadh",     slug: "escorts-riyadh-2066",       pop: 7.6 },
  { city: "Barcelona",  slug: "escorts-barcelona-227",     pop: 5.6 },
  { city: "Bucharest",  slug: "escorts-bucharest-218",     pop: 1.8 },
  { city: "Madrid",     slug: "escorts-madrid-229",        pop: 6.7 },
  { city: "Hamburg",    slug: "escorts-hamburg-198",       pop: 1.9 },
  { city: "Moscow",     slug: "escorts-moscow-221",        pop: 12.6 },
  { city: "Frankfurt",  slug: "escorts-frankfurt-197",     pop: 5.6 },
  { city: "Hong Kong",  slug: "escorts-hong-kong-1226",    pop: 7.5 },
  { city: "Lisbon",     slug: "escorts-lisbon-216",        pop: 2.9 },
  { city: "Toronto",    slug: "escorts-toronto-20",        pop: 6.2 },
  { city: "Athens",     slug: "escorts-athens-202",        pop: 3.2 },
  { city: "Budapest",   slug: "escorts-budapest-142",      pop: 1.8 },
  { city: "Montreal",   slug: "escorts-montreal-341",      pop: 4.3 },
  { city: "Istanbul",   slug: "escorts-istanbul-363",      pop: 15.8 },
  { city: "Stockholm",  slug: "escorts-stockholm-234",     pop: 1.6 },
  { city: "Copenhagen", slug: "escorts-copenhagen-179",    pop: 1.4 },
  { city: "Vancouver",  slug: "escorts-vancouver-13",      pop: 2.6 },
  { city: "Oslo",       slug: "escorts-oslo-211",          pop: 1.1 },
  { city: "Porto",      slug: "escorts-porto-217",         pop: 1.3 },
  { city: "Rotterdam",  slug: "escorts-rotterdam-260",     pop: 1.0 },
  { city: "Bratislava", slug: "escorts-bratislava-224",    pop: 0.7 },
  { city: "Luxembourg", slug: "escorts-luxembourg-210",    pop: 0.6 },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE = "https://www.escortdirectory.com";

async function fetchCityCount(entry) {
  try {
    const resp = await fetch(`${BASE}/${entry.slug}/`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { ...entry, count: null };
    const html = await resp.text();

    // Count profile links on the page (href="/escort/...")
    const profiles = (html.match(/href="\/escort\/[^"]*"/g) || []).length;
    // Get max pagination page number
    const pages = html.match(/page=(\d+)/g);
    const maxPage = pages
      ? Math.max(...pages.map((p) => parseInt(p.split("=")[1], 10)))
      : 1;
    // Estimate total: profiles per page × number of pages
    const count = profiles > 0 ? profiles * maxPage : null;
    return { ...entry, count };
  } catch {
    return { ...entry, count: null };
  }
}

export default async function handler(req, res) {
  try {
    // Fetch all cities in parallel
    const results = await Promise.allSettled(CITIES.map(fetchCityCount));

    const cities = results
      .filter((r) => r.status === "fulfilled" && r.value.count != null)
      .map((r) => {
        const { city, count, slug, pop } = r.value;
        const countPer100k = pop ? Math.round((count / pop) * 0.1 * 100) / 100 : null;
        return { city, count, url: `/${slug}/`, population: pop, countPer100k };
      })
      .sort((a, b) => b.count - a.count);

    const totalWorldwide = cities.reduce((sum, c) => sum + c.count, 0);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

    return res.status(200).json({
      source: "escortdirectory.com",
      fetchedAt: new Date().toISOString(),
      totalWorldwide,
      cities,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, cities: [] });
  }
}
