const FEEDS = [
  ["BBC", "http://feeds.bbci.co.uk/news/world/rss.xml"],
  // Reuters killed its public RSS feed (permanent 401 as of 2026); replaced
  // with The Guardian's World feed, which is free, unauthenticated, and
  // returns a valid <rss> document from a plain datacenter-IP curl.
  ["Guardian", "https://www.theguardian.com/world/rss"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["NYT", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"],
  ["FT", "https://www.ft.com/world?format=rss"],
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml",
};

const decodeEntities = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(amp|lt|gt|quot|nbsp|apos);|&#39;|&#x27;/g, (m, n) => ({
    amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", apos: "'", "&#39;": "'", "&#x27;": "'",
  }[n || m] || m));

const stripTags = (s = "") => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function parseItems(xml, source, limit = 10) {
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).slice(0, limit).map((item) => {
    const pick = (tag) => item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "";
    const title = decodeEntities(pick("title")).trim();
    const url = decodeEntities(pick("link")).trim();
    const parsed = Date.parse(decodeEntities(pick("pubDate")).trim());
    const description = stripTags(pick("description")).slice(0, 180).trim() || null;
    return title && url ? {
      title,
      url,
      publishedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      description,
      source,
    } : null;
  }).filter(Boolean);
}

export default async function handler(req, res) {
  const fetchedAt = new Date().toISOString();
  const errors = {};
  try {
    const results = await Promise.allSettled(FEEDS.map(async ([source, url]) => {
      let resp;
      try {
        resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
      } catch (err) {
        throw new Error(err?.name === "TimeoutError" ? "timeout" : err?.message || "fetch failed");
      }
      if (!resp.ok) throw new Error(`http ${resp.status}`);
      return { source, items: parseItems(await resp.text(), source, 10) };
    }));

    const seen = new Set();
    const items = results.flatMap((result, i) => {
      const source = FEEDS[i][0];
      if (result.status !== "fulfilled") {
        errors[source] = result.reason?.message || "fetch failed";
        return [];
      }
      return result.value.items.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
    }).sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    }).slice(0, 30);

    const sources = [...new Set(items.map((item) => item.source))];
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({ items, sources, fetchedAt, errors });
  } catch (err) {
    console.error(err?.message || err);
    return res.status(200).json({ items: [], sources: [], fetchedAt, errors: { global: err?.message || "unknown error" } });
  }
}
