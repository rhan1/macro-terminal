// Serves structured layoff data from a Blob written by the
// /api/cron/refresh-layoffs cron. Falls back to live Google News RSS
// if the Blob is missing or stale, so the UI never shows a dead tab.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const FEED_URL =
  "https://news.google.com/rss/search?q=layoffs+company&hl=en-US&gl=US&ceid=US:en";
const BLOB_PATH = "labor/layoffs-structured.json";
const STALE_AFTER_HOURS = 28;

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

function parseRssItems(xml, limit) {
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

async function fetchRawRss() {
  try {
    const resp = await fetch(FEED_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssItems(xml, 15);
  } catch {
    return [];
  }
}

async function fetchStructuredBlob() {
  return await getJSON(BLOB_PATH);
}

function staleMeta(fetchedAt) {
  const ts = Date.parse(fetchedAt || "");
  if (Number.isNaN(ts)) return {};

  const staleHours = Math.floor((Date.now() - ts) / (60 * 60 * 1000));
  if (staleHours <= STALE_AFTER_HOURS) return {};
  return { stale: true, staleHours };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  const blob = await fetchStructuredBlob();

  if (blob && Array.isArray(blob.structured) && blob.structured.length > 0) {
    return res.status(200).json({
      structured: blob.structured,
      aggregates: blob.aggregates || null,
      rawNews: blob.rawNews || [],
      items: blob.rawNews || [],
      source: "SEC 8-K + Claude Haiku + Google News RSS",
      fetchedAt: blob.fetchedAt,
      model: blob.model || null,
      ...staleMeta(blob.fetchedAt),
    });
  }

  const rss = await fetchRawRss();
  return res.status(200).json({
    structured: [],
    aggregates: null,
    rawNews: rss,
    items: rss,
    source: "Google News RSS (Blob not yet seeded)",
    fetchedAt: new Date().toISOString(),
  });
}
