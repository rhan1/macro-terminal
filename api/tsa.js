// Scrapes TSA checkpoint passenger volumes from tsa.gov.
// Returns recent daily rows plus year-over-year context when available.

const URL = "https://www.tsa.gov/travel/passenger-volumes";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ");
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " "));
}

function cleanCell(s) {
  return stripTags(s).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(s) {
  const v = cleanCell(s).replace(/[,\s]/g, "");
  return !v || v === "—" || v === "-" ? null : /^\d+$/.test(v) ? parseInt(v, 10) : null;
}

function toIsoDate(raw) {
  const s = cleanCell(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

export default async function handler(req, res) {
  const empty = { source: "tsa.gov", url: URL, fetchedAt: new Date().toISOString(), latest: null, rows: [] };

  try {
    const resp = await fetch(URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      return res.status(200).json({ ...empty, error: `Upstream HTTP ${resp.status}` });
    }

    const html = await resp.text();
    const tableMatch = html.match(/<table\b[\s\S]*?<\/table>/i);
    if (!tableMatch) {
      return res.status(200).json({ ...empty, error: "Passenger table not found" });
    }

    const tableHtml = tableMatch[0];
    const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cleanCell(m[1]));
    const years = headers.slice(1).map((h) => {
      const m = h.match(/\b(20\d{2})\b/);
      return m ? parseInt(m[1], 10) : null;
    });

    const rows = [];
    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
      if (cells.length < 2) continue;
      const date = toIsoDate(cells[0]);
      const nums = cells.slice(1, 5).map(parseNumber);
      if (!date || nums.every((n) => n == null)) continue;

      let current = nums[0] ?? null;
      let priorYear = nums[1] ?? null;
      let twoYearsAgo = nums[2] ?? null;
      let threeYearsAgo = nums[3] ?? null;

      if (years.some(Boolean)) {
        const indexed = nums.map((value, i) => ({ value, year: years[i] })).filter((x) => x.value != null);
        const rankedYears = [...new Set(indexed.map((x) => x.year).filter(Boolean))].sort((a, b) => b - a);
        const byYear = Object.fromEntries(indexed.filter((x) => x.year).map((x) => [x.year, x.value]));
        if (rankedYears[0]) current = byYear[rankedYears[0]] ?? current;
        if (rankedYears[1]) priorYear = byYear[rankedYears[1]] ?? priorYear;
        if (rankedYears[2]) twoYearsAgo = byYear[rankedYears[2]] ?? twoYearsAgo;
        if (rankedYears[3]) threeYearsAgo = byYear[rankedYears[3]] ?? threeYearsAgo;
      }

      rows.push({ date, current, priorYear, twoYearsAgo, threeYearsAgo });
    }

    if (!rows.length) {
      return res.status(200).json({ ...empty, error: "No data rows found" });
    }

    const latestRow = rows[0];
    // TSA's live page is a single-column time series — YoY columns were removed.
    // Compute a rolling 30-day delta from the rows array so the card still has
    // a comparative signal.
    const windowRow = rows[Math.min(rows.length - 1, 29)] ?? null;
    const deltaPct = latestRow.current != null && windowRow?.current
      ? round1(((latestRow.current - windowRow.current) / windowRow.current) * 100)
      : null;
    const latest = {
      ...latestRow,
      yoyPct: latestRow.current != null && latestRow.priorYear ? round1(((latestRow.current - latestRow.priorYear) / latestRow.priorYear) * 100) : null,
      twoYearPct: latestRow.current != null && latestRow.twoYearsAgo ? round1(((latestRow.current - latestRow.twoYearsAgo) / latestRow.twoYearsAgo) * 100) : null,
      deltaPct,
      deltaWindow: windowRow?.date ?? null,
    };

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    return res.status(200).json({
      source: "tsa.gov",
      url: URL,
      fetchedAt: new Date().toISOString(),
      latest,
      rows: rows.slice(0, 30),
    });
  } catch (err) {
    return res.status(200).json({ ...empty, error: err?.message || "Unknown error" });
  }
}
