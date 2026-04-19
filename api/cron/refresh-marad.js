import { put } from "@vercel/blob";

const BASE_URL = "https://www.maritime.dot.gov";
const LIST_URL = `${BASE_URL}/msci-advisories`;
const UKMTO_URL = "https://www.ukmto.org/ukmto-products/advisories/2026";
const BLOB_PATH = "shipments/advisories.json";
const MAX_ADVISORIES = 30;
const PAGE_COUNT = 3;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
};

const REGION_PATTERNS = [
  { tag: "Red Sea", re: /\bred sea\b/i },
  { tag: "Bab el-Mandeb", re: /\bbab el[- ]mandeb\b/i },
  { tag: "Gulf of Aden", re: /\bgulf of aden\b/i },
  { tag: "Arabian Sea", re: /\barabian sea\b/i },
  { tag: "Somali Basin", re: /\bsomali basin\b/i },
  { tag: "Strait of Hormuz", re: /\bstrait of hormuz\b/i },
  { tag: "Persian Gulf", re: /\bpersian gulf\b/i },
  { tag: "Gulf of Oman", re: /\bgulf of oman\b/i },
  { tag: "Suez Canal", re: /\bsuez canal\b/i },
  { tag: "Black Sea", re: /\bblack sea\b/i },
  { tag: "Sea of Azov", re: /\bsea of azov\b/i },
  { tag: "Indian Ocean", re: /\bindian ocean\b/i },
  { tag: "Gulf of Guinea", re: /\bgulf of guinea\b/i },
];

function decodeHtml(text = "") {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIssuedAt(value = "") {
  const [month, day, year] = value.trim().split("/");
  if (!month || !day || !year) return null;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

function inferRegionTags(title) {
  return REGION_PATTERNS.filter(({ re }) => re.test(title)).map(({ tag }) => tag);
}

function parseAdvisories(html) {
  const advisories = [];
  const rowRe = /<tr>\s*<td[^>]*>\s*<a href="([^"]+)"[^>]*>(\d{4}-\d{3}[\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi;

  for (const match of html.matchAll(rowRe)) {
    const rawTitle = decodeHtml(match[2].replace(/<[^>]+>/g, ""));
    const advisoryNumber = rawTitle.match(/^(\d{4}-\d{3})-/)?.[1] || null;
    const title = advisoryNumber ? rawTitle.slice(advisoryNumber.length + 1).trim() : rawTitle;
    const issuedAt = parseIssuedAt(decodeHtml(match[4]));
    if (!advisoryNumber || !title || !issuedAt) continue;

    advisories.push({
      advisoryNumber,
      title,
      issuedAt,
      status: decodeHtml(match[3]),
      url: match[1].startsWith("http") ? match[1] : `${BASE_URL}${match[1]}`,
      regionTags: inferRegionTags(title),
    });
  }

  return advisories;
}

function parseUkmtoAdvisories(html) {
  const advisories = [];
  const cardRe = /<a[^>]+href="([^"]*\/ukmto-products\/advisories\/2026\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(cardRe)) {
    const href = match[1];
    const cardHtml = match[2];
    const text = decodeHtml(cardHtml.replace(/<[^>]+>/g, " "));
    const advisoryNumber = text.match(/\b(\d{3}\/[A-Z]{3}\/\d{4})\b/)?.[1] || null;
    const dateMatch = text.match(/\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/);
    const issuedDate = dateMatch ? new Date(`${dateMatch[1]} 00:00:00 UTC`) : null;
    const issuedAt = issuedDate && !Number.isNaN(issuedDate.getTime()) ? issuedDate.toISOString() : null;
    const title = text
      .replace(advisoryNumber || "", "")
      .replace(dateMatch?.[1] || "", "")
      .replace(/\s+/g, " ")
      .trim();

    if (!advisoryNumber || !title || !issuedAt) continue;

    advisories.push({
      advisoryNumber,
      title,
      issuedAt,
      status: "Published",
      url: href.startsWith("http") ? href : `https://www.ukmto.org${href}`,
      regionTags: inferRegionTags(title),
    });
  }

  return advisories;
}

async function fetchPage(page) {
  const url = page === 0 ? LIST_URL : `${LIST_URL}?page=${page}`;
  const resp = await fetch(url, {
    headers: HTML_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`MARAD page ${page} HTTP ${resp.status}`);
  return resp.text();
}

async function fetchUkmtoPage() {
  const resp = await fetch(UKMTO_URL, {
    headers: HTML_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`UKMTO HTTP ${resp.status}`);
  return resp.text();
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

    let collected = [];
    const errors = [];
    let source = "MARAD";

    for (let page = 0; page < PAGE_COUNT && collected.length < MAX_ADVISORIES; page += 1) {
      try {
        const html = await fetchPage(page);
        const parsed = parseAdvisories(html);
        if (!parsed.length) {
          errors.push(`page ${page}: parse returned 0`);
          continue;
        }
        collected.push(...parsed);
      } catch (err) {
        console.error(`MARAD scrape page ${page} failed:`, err?.message ?? err);
        errors.push(`page ${page}: ${err?.message ?? "unknown error"}`);
      }
    }

    if (collected.length === 0) {
      try {
        const html = await fetchUkmtoPage();
        collected = parseUkmtoAdvisories(html);
        source = "UKMTO";
        if (!collected.length) {
          errors.push("ukmto: parse returned 0");
        }
      } catch (err) {
        console.error("UKMTO scrape failed:", err?.message ?? err);
        errors.push(`ukmto: ${err?.message ?? "unknown error"}`);
      }
    }

    const seen = new Set();
    const advisories = collected
      .filter((item) => {
        if (seen.has(item.advisoryNumber)) return false;
        seen.add(item.advisoryNumber);
        return true;
      })
      .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))
      .slice(0, MAX_ADVISORIES);

    const fetchedAt = new Date().toISOString();
    await put(BLOB_PATH, JSON.stringify({ advisories, fetchedAt, source }), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({
      ok: true,
      source,
      advisories: advisories.length,
      fetchedAt,
      errors,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
