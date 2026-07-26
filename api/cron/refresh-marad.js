import { getJSON, putJSON } from "../../netlify/lib/netlify-blob.mjs";

const BASE_URL = "https://www.maritime.dot.gov";
const LIST_URL = `${BASE_URL}/msci-advisories`;
const UKMTO_URL = "https://www.ukmto.org/ukmto-products/advisories/2026";
const BLOB_PATH = "shipments/advisories.json";
const MAX_ADVISORIES = 30;
const PAGE_COUNT = 3;
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
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
  // Current marad.dot.gov markup (Drupal "views" table, verified live 2026-07-04):
  //   <tbody><tr><td headers="view-title-table-column"><a href="/msci/..." hreflang="en">2026-009-Title</a></td>
  //     <td headers="...status...">Active</td>
  //     <td headers="...effective-date...">06/24/2026</td>
  //     <td headers="...effective-date-1...">12/21/2026</td>
  //   </tr>
  // Anchor attributes are matched order-agnostically (`href` need not be first)
  // so a future markup tweak (e.g. added class/id before href) doesn't silently
  // zero out every row again.
  const rowRe = /<tr>\s*<td[^>]*>\s*<a[^>]*\shref="([^"]+)"[^>]*>(\d{4}-\d{3}[\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi;

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

function parseUkmtoDate(dateStr = "", timeStr = "") {
  // ukmto.org renders "Issue Date" as DD/MM/YYYY (UK format) plus a separate
  // "Time" column (HH:MM) — do not reuse the US-style parseIssuedAt() above.
  const [day, month, year] = dateStr.trim().split("/");
  if (!day || !month || !year) return null;
  const [hh, mm] = (timeStr || "00:00").split(":");
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh) || 0, Number(mm) || 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseUkmtoAdvisories(html) {
  // ukmto.org migrated from HTML advisory "cards" (old markup, matched by the
  // previous regex) to a React-rendered table (verified live 2026-07-04):
  //   <table class="ProductListTable_productListTable__3NQ9C">
  //     <thead>...<th>Reference</th><th>Issue Date</th><th>Time</th><th>Name</th><th>Location</th>...</thead>
  //     <tbody><tr class="ProductListTable_productTableRow__4Y8x8">
  //       <td>UKMTO ADVISORY 003-26</td><td>28/02/2026</td><td>02:00</td>
  //       <td>20260228-UKMTO_ADVISORY_003-26</td><td>Arabian Sea</td>
  //       <td class="...pdfColumn..."><a href="https://.../....pdf?rev=...">Open PDF</a>...</td>
  //     </tr></tbody>
  //   </table>
  // The header row shares the same <tr class="ProductListTable_productTableRow...">
  // class but uses <th>, not <td>, so it's naturally skipped by the tds.length check.
  const advisories = [];
  const rowRe = /<tr class="ProductListTable_productTableRow[^"]*">([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  for (const rowMatch of html.matchAll(rowRe)) {
    const rowHtml = rowMatch[1];
    const tds = [...rowHtml.matchAll(tdRe)].map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, " ")));
    if (tds.length < 5) continue; // header row (all <th>) or malformed row

    const [reference, dateStr, timeStr, , location] = tds;
    const pdfHref = rowHtml.match(/href="(https:[^"]+\.pdf[^"]*)"/i)?.[1] || null;
    const issuedAt = parseUkmtoDate(dateStr, timeStr);
    if (!reference || !issuedAt) continue;

    const title = location ? `${reference} - ${location}` : reference;
    advisories.push({
      advisoryNumber: reference,
      title,
      issuedAt,
      status: "Published",
      url: pdfHref,
      regionTags: inferRegionTags(title),
    });
  }

  return advisories;
}

async function scrapingBeeFetch(targetUrl, opts = {}) {
  // Route through ScrapingBee because maritime.dot.gov blocks direct cron scraping
  // (confirmed: direct fetch gets an Akamai "Access Denied" 403). ScrapingBee has
  // a hard monthly call cap though (confirmed: account currently returns 401
  // "Monthly API calls limit reached" on every URL, not just this one) — when that
  // happens, fall back to a direct fetch rather than failing outright. Direct fetch
  // may still be blocked, but it's strictly better than giving up immediately, and
  // costs nothing if Akamai's IP/UA block ever loosens or the runtime IP differs.
  if (SCRAPINGBEE_API_KEY) {
    try {
      const beeUrl =
        `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_API_KEY}` +
        `&url=${encodeURIComponent(targetUrl)}&render_js=false&premium_proxy=true&country_code=us`;
      const beeResp = await fetch(beeUrl, { signal: opts.signal });
      if (beeResp.ok) return beeResp;
      console.error(`ScrapingBee fetch failed for ${targetUrl}: HTTP ${beeResp.status} ${await beeResp.text().catch(() => "")}`);
    } catch (err) {
      console.error(`ScrapingBee fetch errored for ${targetUrl}:`, err?.message ?? err);
    }
  }

  return fetch(targetUrl, opts);
}

async function fetchPage(page) {
  const url = page === 0 ? LIST_URL : `${LIST_URL}?page=${page}`;
  const resp = await scrapingBeeFetch(url, {
    headers: HTML_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`MARAD page ${page} HTTP ${resp.status}`);
  return resp.text();
}

async function fetchUkmtoPage() {
  const resp = await scrapingBeeFetch(UKMTO_URL, {
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

    // Guard: never let a scrape failure (upstream markup change, blocked IP,
    // exhausted ScrapingBee quota, etc.) blank out a previously-good feed.
    // Keep serving the last non-empty advisory list and just log the miss —
    // an empty result here means the fetch/parse pipeline failed, not that
    // MARAD/UKMTO genuinely published zero advisories (that scenario doesn't
    // happen in practice; there are always cancelled/expired advisories listed).
    let finalAdvisories = advisories;
    let staleGuardTriggered = false;
    let priorFetchedAt = null;
    if (advisories.length === 0) {
      const prior = await getJSON(BLOB_PATH);
      if (prior?.advisories?.length) {
        staleGuardTriggered = true;
        finalAdvisories = prior.advisories;
        priorFetchedAt = prior.fetchedAt ?? null;
        console.warn(
          `MARAD refresh got 0 advisories (source=${source}); keeping ${prior.advisories.length} prior advisories from ${priorFetchedAt}. Errors: ${JSON.stringify(errors)}`
        );
      }
    }

    await putJSON(BLOB_PATH, {
      advisories: finalAdvisories,
      fetchedAt: staleGuardTriggered ? priorFetchedAt : fetchedAt,
      source: staleGuardTriggered ? "stale-guard" : source,
      lastAttemptAt: fetchedAt,
      lastAttemptErrors: errors.length ? errors : undefined,
    });

    return res.status(200).json({
      ok: true,
      source,
      advisories: finalAdvisories.length,
      staleGuardTriggered,
      fetchedAt: staleGuardTriggered ? priorFetchedAt : fetchedAt,
      lastAttemptAt: fetchedAt,
      errors,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
