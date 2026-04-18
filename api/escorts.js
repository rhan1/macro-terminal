// Scrapes https://www.escortdirectory.com/ for aggregate city-level listing counts.
// Used as an unconventional economic indicator (demand proxy for high-income leisure spending).
// Homepage is geo-localized by IP, so we fetch known city pages directly.

// Each city tagged with ISO 3166-1 alpha-2 country code (lowercase) to match
// the world-map SVG path IDs in src/assets/world-map/world-map.min.svg.
const CITIES = [
  { city: "London",     slug: "escorts-london-54",        pop: 9.5,  iso: "gb", country: "United Kingdom" },
  { city: "Dubai",      slug: "escorts-dubai-145",        pop: 3.5,  iso: "ae", country: "United Arab Emirates" },
  { city: "Abu Dhabi",  slug: "escorts-abu-dhabi-393",    pop: 1.5,  iso: "ae", country: "United Arab Emirates" },
  { city: "Warsaw",     slug: "escorts-warsaw-213",       pop: 1.8,  iso: "pl", country: "Poland" },
  { city: "Amsterdam",  slug: "escorts-amsterdam-131",    pop: 1.1,  iso: "nl", country: "Netherlands" },
  { city: "Doha",       slug: "escorts-doha-445",         pop: 2.0,  iso: "qa", country: "Qatar" },
  { city: "Zurich",     slug: "escorts-zurich-241",       pop: 0.4,  iso: "ch", country: "Switzerland" },
  { city: "Berlin",     slug: "escorts-berlin-194",       pop: 3.6,  iso: "de", country: "Germany" },
  { city: "Riyadh",     slug: "escorts-riyadh-2066",      pop: 7.6,  iso: "sa", country: "Saudi Arabia" },
  { city: "Barcelona",  slug: "escorts-barcelona-227",    pop: 5.6,  iso: "es", country: "Spain" },
  { city: "Bucharest",  slug: "escorts-bucharest-218",    pop: 1.8,  iso: "ro", country: "Romania" },
  { city: "Madrid",     slug: "escorts-madrid-229",       pop: 6.7,  iso: "es", country: "Spain" },
  { city: "Hamburg",    slug: "escorts-hamburg-198",      pop: 1.9,  iso: "de", country: "Germany" },
  { city: "Moscow",     slug: "escorts-moscow-221",       pop: 12.6, iso: "ru", country: "Russia" },
  { city: "Frankfurt",  slug: "escorts-frankfurt-197",    pop: 5.6,  iso: "de", country: "Germany" },
  { city: "Hong Kong",  slug: "escorts-hong-kong-1226",   pop: 7.5,  iso: "hk", country: "Hong Kong" },
  { city: "Lisbon",     slug: "escorts-lisbon-216",       pop: 2.9,  iso: "pt", country: "Portugal" },
  { city: "Toronto",    slug: "escorts-toronto-20",       pop: 6.2,  iso: "ca", country: "Canada" },
  { city: "Athens",     slug: "escorts-athens-202",       pop: 3.2,  iso: "gr", country: "Greece" },
  { city: "Budapest",   slug: "escorts-budapest-142",     pop: 1.8,  iso: "hu", country: "Hungary" },
  { city: "Montreal",   slug: "escorts-montreal-341",     pop: 4.3,  iso: "ca", country: "Canada" },
  { city: "Istanbul",   slug: "escorts-istanbul-363",     pop: 15.8, iso: "tr", country: "Turkey" },
  { city: "Stockholm",  slug: "escorts-stockholm-234",    pop: 1.6,  iso: "se", country: "Sweden" },
  { city: "Copenhagen", slug: "escorts-copenhagen-179",   pop: 1.4,  iso: "dk", country: "Denmark" },
  { city: "Vancouver",  slug: "escorts-vancouver-13",     pop: 2.6,  iso: "ca", country: "Canada" },
  { city: "Oslo",       slug: "escorts-oslo-211",         pop: 1.1,  iso: "no", country: "Norway" },
  { city: "Porto",      slug: "escorts-porto-217",        pop: 1.3,  iso: "pt", country: "Portugal" },
  { city: "Rotterdam",  slug: "escorts-rotterdam-260",    pop: 1.0,  iso: "nl", country: "Netherlands" },
  { city: "Bratislava", slug: "escorts-bratislava-224",   pop: 0.7,  iso: "sk", country: "Slovakia" },
  { city: "Luxembourg", slug: "escorts-luxembourg-210",   pop: 0.6,  iso: "lu", country: "Luxembourg" },
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

    // Exact count lives in the page h1, e.g.
    //   <h1><span class="escorts-count">243</span> Escorts in London</h1>
    const exact = html.match(/<span class="escorts-count">\s*([\d,]+)\s*<\/span>/i);
    if (exact) {
      return { ...entry, count: parseInt(exact[1].replace(/,/g, ""), 10) };
    }

    // Fallback: count visible profile cards on the first page
    const profiles = (html.match(/href="\/escort\/[^"]*"/g) || []).length;
    return { ...entry, count: profiles > 0 ? profiles : null };
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
        const { city, count, slug, pop, iso, country } = r.value;
        const countPer100k = pop ? Math.round((count / pop) * 0.1 * 100) / 100 : null;
        return { city, count, url: `/${slug}/`, population: pop, countPer100k, iso, country };
      })
      .sort((a, b) => b.count - a.count);

    const totalWorldwide = cities.reduce((sum, c) => sum + c.count, 0);

    // Aggregate by country (ISO code) for the world heatmap layer.
    const countryMap = new Map();
    for (const c of cities) {
      if (!c.iso) continue;
      const entry = countryMap.get(c.iso) ?? {
        iso: c.iso,
        country: c.country,
        total: 0,
        cities: [],
      };
      entry.total += c.count;
      entry.cities.push({ city: c.city, count: c.count, countPer100k: c.countPer100k });
      countryMap.set(c.iso, entry);
    }
    const countries = [...countryMap.values()]
      .map((e) => ({
        ...e,
        cities: e.cities.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

    return res.status(200).json({
      source: "escortdirectory.com",
      fetchedAt: new Date().toISOString(),
      totalWorldwide,
      cities,
      countries,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, cities: [] });
  }
}
