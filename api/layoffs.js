// Recent named-company layoff headlines via Google News RSS.
// No auth, no API key, reliable — pivoted here after layoffs.fyi proved
// unreachable and TrueUp sits behind a Cloudflare managed challenge.

const FEED_URL =
  "https://news.google.com/rss/search?q=layoffs+company&hl=en-US&gl=US&ceid=US:en";

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, "").trim());
}

// Titles come as "Headline - Source" from Google News. Split off the source
// suffix when possible.
function splitTitleAndSource(raw) {
  const title = decodeEntities(raw);
  const sepIdx = title.lastIndexOf(" - ");
  if (sepIdx > 0 && sepIdx > title.length - 60) {
    return {
      title: title.slice(0, sepIdx).trim(),
      source: title.slice(sepIdx + 3).trim(),
    };
  }
  return { title, source: "" };
}

function parseItems(xml, limit) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      if (!mm) return "";
      return mm[1].replace(/^<!\[CDATA\[|]]>$/g, "").trim();
    };
    const rawTitle = pick("title");
    if (!rawTitle) continue;
    const { title, source } = splitTitleAndSource(rawTitle);
    const link = pick("link");
    const pubDate = pick("pubDate");
    let date = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) date = d.toISOString();
    }
    // Use the explicit <source> tag when present (overrides the suffix split)
    const explicitSource = pick("source");
    items.push({
      title,
      source: explicitSource ? decodeEntities(explicitSource) : source,
      url: link,
      date,
    });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=900, stale-while-revalidate=3600" // 15 min fresh, 1 hour stale
  );

  try {
    const resp = await fetch(FEED_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      return res.status(200).json({
        items: [],
        source: "Google News RSS",
        error: `Upstream HTTP ${resp.status}`,
      });
    }

    const xml = await resp.text();
    const items = parseItems(xml, 15);

    return res.status(200).json({
      items,
      source: "Google News RSS · query: layoffs company",
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      items: [],
      source: "Google News RSS",
      error: err?.message || "Unknown error",
    });
  }
}
