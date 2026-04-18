// Google Trends — Search Interest via SerpAPI
// Terms chosen as stress/distress proxies (true "alternative" data)
// SerpAPI Google Trends returns weekly bins for date=today+12-m; polling
// weekly (not daily) gives identical signal at 1/7th the quota.
// Free tier: 250 req/mo. 20 terms × ~4 polls/mo = 80/mo (170 headroom).

const TERMS = [
  // Distress core (original 8)
  "pawn shop near me",
  "payday loan",
  "sell my gold",
  "food bank near me",
  "side hustle",
  "how to make money fast",
  "recession",
  "how to file for unemployment",
  // Inflation coping
  "egg prices",
  "dollar tree",
  "coupon code",
  // Housing distress
  "rent assistance",
  "home foreclosure",
  "eviction notice",
  // Credit stress
  "401k withdrawal",
  "credit card debt",
  "bankruptcy",
  // Income stress
  "second job",
  "medical bills",
  "gig work",
];

// Parse "Apr 14 – 20, 2025" → "2025-04-14" (ISO start-of-week date)
function parseWeekStart(dateStr) {
  if (!dateStr) return null;
  try {
    // Format: "Apr 14 – 20, 2025" or "Apr 28 – May 4, 2025"
    // Extract the start month, day, and year
    const clean = dateStr.replace(/\s+/g, " ").trim();
    // Try to match "Mon DD – DD, YYYY" or "Mon DD – Mon DD, YYYY"
    const m = clean.match(/^([A-Za-z]+)\s+(\d+)\s*[–-]/);
    const yearM = clean.match(/(\d{4})$/);
    if (!m || !yearM) return null;
    const monthName = m[1];
    const day = parseInt(m[2], 10);
    const year = parseInt(yearM[1], 10);
    const MONTHS = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const month = MONTHS[monthName];
    if (!month) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

async function fetchTerm(term, apiKey) {
  const url =
    `https://serpapi.com/search?engine=google_trends` +
    `&q=${encodeURIComponent(term)}` +
    `&date=today+12-m` +
    `&data_type=TIMESERIES` +
    `&geo=US` +
    `&api_key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SerpAPI ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(json.error);
  }

  const timeline = json?.interest_over_time?.timeline_data ?? [];

  // Build data array (chronological, oldest first)
  const data = timeline.map((entry) => {
    const isoDate = parseWeekStart(entry.date) ?? entry.date;
    const value = entry?.values?.[0]?.extracted_value ?? null;
    return { date: isoDate, value };
  }).filter((d) => d.value !== null);

  if (data.length === 0) {
    return { term, current: null, change: null, peak: null, data: [] };
  }

  const current = data[data.length - 1].value;

  // ~4 weeks ago = index approx (data.length - 4)
  const fourWeeksIdx = Math.max(0, data.length - 5);
  const fourWeeksAgo = data[fourWeeksIdx]?.value ?? null;
  const change = fourWeeksAgo !== null ? current - fourWeeksAgo : null;

  const peak = Math.max(...data.map((d) => d.value));

  return { term, current, change, peak, data };
}

export default async function handler(req, res) {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;

  // Graceful fallback when key is not configured
  if (!SERPAPI_KEY) {
    return res.status(200).json({
      terms: [],
      source: "Google Trends (not configured)",
      error: "SERPAPI_KEY not set",
    });
  }

  // Weekly cadence — Google Trends bins are weekly; daily polling is wasted quota.
  res.setHeader(
    "Cache-Control",
    "s-maxage=604800, stale-while-revalidate=1209600"
  );

  const results = await Promise.allSettled(
    TERMS.map((term) => fetchTerm(term, SERPAPI_KEY))
  );

  const terms = results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // Graceful per-term fallback
    return {
      term: TERMS[i],
      current: null,
      change: null,
      peak: null,
      data: [],
      error: result.reason?.message ?? "Unknown error",
    };
  });

  return res.status(200).json({
    terms,
    source: "Google Trends via SerpAPI",
    fetchedAt: new Date().toISOString(),
  });
}
