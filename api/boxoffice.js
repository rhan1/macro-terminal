// Scrapes Box Office Mojo weekly top-10 domestic gross.
// Blocked-tolerant: returns HTTP 200 with { error, weeks: [] } on upstream blocks or parse drift.

const URL = "https://www.boxofficemojo.com/weekly/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#8211;|&#x2013;|&ndash;/gi, "–")
    .replace(/&#8212;|&#x2014;|&mdash;/gi, "—")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseMoney(s) {
  const n = String(s || "").replace(/[^\d]/g, "");
  return n ? parseInt(n, 10) : null;
}

function parsePct(s) {
  const m = String(s || "").match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normalizeWeekLabel(label, year) {
  const clean = stripTags(label).replace(/\s*[—–-]\s*/g, " – ");
  return /\b20\d{2}\b/.test(clean) || !year ? clean : `${clean}, ${year}`;
}

function parseWeekStart(label, yearHint) {
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const clean = stripTags(label).replace(/\s*[—–-]\s*/g, "-");
  const m = clean.match(/^([A-Z][a-z]{2})\s+(\d{1,2})-(?:(?:([A-Z][a-z]{2})\s+)?(\d{1,2}))(?:,\s*(20\d{2}))?$/);
  if (!m) return null;
  const year = parseInt(m[5] || yearHint, 10);
  const month = months[m[1]];
  const day = parseInt(m[2], 10);
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function fetchHtml(url) {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 403 || resp.status === 429) return { error: `Upstream HTTP ${resp.status}` };
    if (!resp.ok) return { error: `Upstream HTTP ${resp.status}` };
    return { html: await resp.text() };
  } catch (err) {
    return { error: err?.message || "Fetch failed" };
  }
}

function parseRows(html) {
  const rows = [...String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (!rows.length) return { error: "Weekly table not found", rows: [] };

  let yoyIndex = null;
  const parsed = [];

  for (const [, rowHtml] of rows) {
    const cells = [...rowHtml.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => {
      const attrs = m[2] || "";
      const cls = (attrs.match(/\bclass="([^"]*)"/i) || [])[1] || "";
      return { cls, html: m[3], text: stripTags(m[3]) };
    });
    if (!cells.length) continue;

    if (rowHtml.includes("<th")) {
      yoyIndex = cells.findIndex((c) => /(?:yoy|year|last year|yw)/i.test(c.text));
      continue;
    }

    const dateCell = cells.find((c) => /mojo-field-type-date(?:_interval)?/.test(c.cls));
    const grossCell = cells.find((c) => /mojo-field-type-money/.test(c.cls) && !/mojo-estimatable/.test(c.cls));
    if (!dateCell || !grossCell) continue;

    const hrefMatch = dateCell.html.match(/\/weekly\/(20\d{2})W\d+\//);
    const year = hrefMatch ? parseInt(hrefMatch[1], 10) : null;
    parsed.push({
      weekLabel: normalizeWeekLabel(dateCell.html, year),
      weekStart: parseWeekStart(dateCell.html, year),
      topTenGross: parseMoney(grossCell.text),
      yoyPct: yoyIndex >= 0 && cells[yoyIndex] ? parsePct(cells[yoyIndex].text) : null,
    });
  }

  return parsed.length ? { rows: parsed } : { error: "Weekly table rows not parsed", rows: [] };
}

export default async function handler(req, res) {
  const base = {
    source: "boxofficemojo.com",
    url: URL,
    fetchedAt: new Date().toISOString(),
    latest: null,
    weeks: [],
  };

  res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");

  try {
    const current = await fetchHtml(URL);
    if (current.error) return res.status(200).json({ ...base, error: current.error });

    const currentYearMatch = current.html.match(/option value="\/weekly\/by-year\/(20\d{2})\/" selected/i);
    const currentYear = currentYearMatch ? parseInt(currentYearMatch[1], 10) : new Date().getFullYear();
    const previous = await fetchHtml(`${URL}by-year/${currentYear - 1}/`);
    if (previous.error) return res.status(200).json({ ...base, error: previous.error });

    const first = parseRows(current.html);
    if (first.error) return res.status(200).json({ ...base, error: first.error });
    const second = parseRows(previous.html);
    if (second.error) return res.status(200).json({ ...base, error: second.error });

    const rows = [...first.rows, ...second.rows];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].yoyPct == null) {
        const prior = rows[i + 52];
        if (prior?.topTenGross) rows[i].yoyPct = round1(((rows[i].topTenGross / prior.topTenGross) - 1) * 100);
      }
    }

    const weeks = rows.slice(0, 12).filter((r) => r.topTenGross != null);
    if (!weeks.length) return res.status(200).json({ ...base, error: "Weekly table rows not parsed" });

    return res.status(200).json({
      ...base,
      latest: weeks[0] || null,
      weeks,
    });
  } catch (err) {
    return res.status(200).json({ ...base, error: err?.message || "Unknown error" });
  }
}
