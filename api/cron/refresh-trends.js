import { put } from "@vercel/blob";

const BLOB_PATH = "trends/terms.json";
const TERMS = [
  "pawn shop near me",
  "payday loan",
  "sell my gold",
  "food bank near me",
  "side hustle",
  "how to make money fast",
  "recession",
  "how to file for unemployment",
  "egg prices",
  "dollar tree",
  "coupon code",
  "rent assistance",
  "home foreclosure",
  "eviction notice",
  "401k withdrawal",
  "credit card debt",
  "bankruptcy",
  "second job",
  "medical bills",
  "gig work",
];

function parseWeekStart(dateStr) {
  if (!dateStr) return null;

  try {
    const clean = dateStr.replace(/\s+/g, " ").trim();
    const rangeMatch = clean.match(/^([A-Za-z]+)\s+(\d+)\s*[–-]/);
    const yearMatch = clean.match(/(\d{4})$/);
    if (!rangeMatch || !yearMatch) return null;

    const monthName = rangeMatch[1];
    const day = Number.parseInt(rangeMatch[2], 10);
    const year = Number.parseInt(yearMatch[1], 10);
    const MONTHS = {
      Jan: 1,
      Feb: 2,
      Mar: 3,
      Apr: 4,
      May: 5,
      Jun: 6,
      Jul: 7,
      Aug: 8,
      Sep: 9,
      Oct: 10,
      Nov: 11,
      Dec: 12,
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
  const data = timeline
    .map((entry) => {
      const isoDate = parseWeekStart(entry.date) ?? entry.date;
      const value = entry?.values?.[0]?.extracted_value ?? null;
      return { date: isoDate, value };
    })
    .filter((entry) => entry.value !== null);

  if (data.length === 0) {
    return { term, current: null, change: null, peak: null, data: [] };
  }

  const current = data[data.length - 1].value;
  const fourWeeksIdx = Math.max(0, data.length - 5);
  const fourWeeksAgo = data[fourWeeksIdx]?.value ?? null;
  const change = fourWeeksAgo !== null ? current - fourWeeksAgo : null;
  const peak = Math.max(...data.map((entry) => entry.value));

  return { term, current, change, peak, data };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const apiKey = process.env.SERPAPI_KEY;
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!apiKey) {
      console.error("refresh-trends: SERPAPI_KEY missing");
      return res.status(200).json({
        ok: true,
        terms: 0,
        fetchedAt: new Date().toISOString(),
        errors: 1,
      });
    }

    if (!token) {
      console.error("refresh-trends: BLOB_READ_WRITE_TOKEN missing");
      return res.status(200).json({
        ok: true,
        terms: 0,
        fetchedAt: new Date().toISOString(),
        errors: 1,
      });
    }

    const results = await Promise.allSettled(TERMS.map((term) => fetchTerm(term, apiKey)));

    const terms = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      console.error(`refresh-trends: ${TERMS[index]} failed:`, result.reason?.message ?? result.reason);
      return {
        term: TERMS[index],
        current: null,
        change: null,
        peak: null,
        data: [],
        error: result.reason?.message ?? "Unknown error",
      };
    });

    const fetchedAt = new Date().toISOString();
    const errorCount = results.filter((result) => result.status === "rejected").length;
    const body = {
      terms,
      source: "Google Trends via SerpAPI",
      fetchedAt,
    };

    try {
      await put(BLOB_PATH, JSON.stringify(body), {
        access: "private",
        contentType: "application/json",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (error) {
      console.error("refresh-trends: blob write failed:", error?.message ?? error);
      return res.status(200).json({
        ok: true,
        terms: terms.length,
        fetchedAt,
        errors: errorCount + 1,
      });
    }

    return res.status(200).json({
      ok: true,
      terms: terms.length,
      fetchedAt,
      errors: errorCount,
    });
  } catch (error) {
    console.error("refresh-trends: unexpected failure:", error?.message ?? error);
    return res.status(200).json({
      ok: true,
      terms: 0,
      fetchedAt: new Date().toISOString(),
      errors: 1,
    });
  }
}
