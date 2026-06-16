// Fetches maritime-relevant conflict events from ACLED for the Red Sea
// / Bab el-Mandeb / Hormuz region and writes a distilled feed to private
// Vercel Blob at shipments/incidents.json.
//
// ACLED uses OAuth2 password-grant: POST email+password to /oauth/token,
// receive 24h bearer. Tokens aren't cached — one fresh exchange per cron
// run is cheap (~200ms) and sidesteps expiration tracking.
//
// Account data-recency is capped at 12 months (rolling), so we query the
// last 365 days of events for each country in the region.
import { putJSON } from "../../netlify/lib/netlify-blob.mjs";

const OAUTH_URL = "https://acleddata.com/oauth/token";
const READ_URL = "https://acleddata.com/api/acled/read";
const BLOB_PATH = "shipments/incidents.json";
const NEWS_RSS_URL = 'https://news.google.com/rss/search?q=%22strait+of+hormuz%22+OR+%22red+sea%22+OR+%22suez+canal%22+OR+houthi+OR+%22shipping+incident%22+OR+%22cargo+ship%22+OR+%22tanker%22&hl=en-US&gl=US&ceid=US:en';

// Countries bordering Red Sea / Bab el-Mandeb / Gulf of Aden / Hormuz.
const REGION_COUNTRIES = [
  "Yemen",
  "Saudi Arabia",
  "Egypt",
  "Sudan",
  "Djibouti",
  "Oman",
];

// Rough bounding boxes for each chokepoint — used to flag events by where
// they happened (beyond just country borders) and attach to a chokepoint.
const CHOKEPOINT_BOXES = [
  { name: "Bab el-Mandeb",     latMin: 11.5, latMax: 13.5, lonMin: 43.0, lonMax: 44.5 },
  { name: "Red Sea South",     latMin: 13.5, latMax: 18.0, lonMin: 40.0, lonMax: 44.0 },
  { name: "Red Sea North",     latMin: 18.0, latMax: 28.0, lonMin: 32.0, lonMax: 40.0 },
  { name: "Suez Canal",        latMin: 29.5, latMax: 31.5, lonMin: 31.5, lonMax: 33.5 },
  { name: "Gulf of Aden",      latMin: 11.0, latMax: 14.5, lonMin: 44.5, lonMax: 52.0 },
  { name: "Strait of Hormuz",  latMin: 24.5, latMax: 27.5, lonMin: 54.5, lonMax: 58.5 },
];

// Keywords that strongly suggest an event targeted a vessel or sea-lane
// traffic rather than land-based civilians/combatants.
const MARITIME_KEYWORDS = [
  "vessel", "ship", "tanker", "cargo", "bulker", "container", "dhow",
  "maritime", "coast guard", "naval", "strait", "port", "harbor", "harbour",
  "red sea", "bab el-mandeb", "bab al-mandab", "hormuz", "suez", "aden",
  "houthi", "missile", "anti-ship", "unmanned surface", "kamikaze",
];

const EXCLUDE_KEYWORDS = [
  "darfur", "khartoum", "omdurman", "el fasher", "eid al hadd", "rsf",
  "saf", "el obeid", "bara", "idp camp",
];

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

async function exchangeToken(email, password) {
  const body = new URLSearchParams({
    username: email,
    password,
    grant_type: "password",
    client_id: "acled",
  });
  const resp = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`ACLED token ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("no access_token in response");
  return data.access_token;
}

async function fetchCountryEvents(token, country, startDate, endDate, limit) {
  const url = `${READ_URL}?_format=json&country=${encodeURIComponent(country)}&event_date=${startDate}%7C${endDate}&event_date_where=BETWEEN&limit=${limit}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) return { country, data: [], error: `http ${resp.status}` };
  const j = await resp.json();
  return { country, data: Array.isArray(j?.data) ? j.data : [] };
}

function chokepointFor(lat, lon) {
  if (lat == null || lon == null) return null;
  for (const c of CHOKEPOINT_BOXES) {
    if (lat >= c.latMin && lat <= c.latMax && lon >= c.lonMin && lon <= c.lonMax) {
      return c.name;
    }
  }
  return null;
}

function isMaritime(ev) {
  const lat = Number(ev.latitude);
  const lon = Number(ev.longitude);
  const excludeHay = `${ev.location || ""} ${ev.notes || ""}`.toLowerCase();
  const hay = `${ev.notes || ""} ${ev.sub_event_type || ""} ${ev.actor1 || ""} ${ev.actor2 || ""} ${ev.location || ""}`.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((kw) => excludeHay.includes(kw))) return false;
  const maritimeTagged = MARITIME_KEYWORDS.some((kw) => hay.includes(kw));
  if (maritimeTagged) return true;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return CHOKEPOINT_BOXES.some((c) =>
    lat >= c.latMin - 0.45 && lat <= c.latMax + 0.45 && lon >= c.lonMin - 0.45 && lon <= c.lonMax + 0.45
  );
}

function decodeXml(text = "") {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function fetchGoogleNews() {
  try {
    const resp = await fetch(NEWS_RSS_URL, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`Google News RSS ${resp.status}`);
    const xml = await resp.text();
    const seen = new Set();
    const minTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const item = m[1];
      const pick = (tag) => decodeXml(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
      const link = pick("link");
      const pubDate = pick("pubDate");
      return {
        title: pick("title"),
        link,
        source: pick("source") || (pick("title").split(" - ").slice(1).join(" - ") || "Google News"),
        pubDate,
        description: pick("description").replace(/<[^>]+>/g, "").slice(0, 400),
      };
    }).filter((item) => {
      const ts = Date.parse(item.pubDate);
      if (!item.link || seen.has(item.link) || Number.isNaN(ts) || ts < minTs) return false;
      seen.add(item.link);
      return true;
    }).sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate)).slice(0, 30);
  } catch (err) {
    console.error("Google News RSS fetch failed:", err?.message ?? err);
    return [];
  }
}

function normalize(ev) {
  const lat = ev.latitude != null ? Number(ev.latitude) : null;
  const lon = ev.longitude != null ? Number(ev.longitude) : null;
  return {
    id: ev.event_id_cnty || null,
    date: ev.event_date || null,
    eventType: ev.event_type || null,
    subType: ev.sub_event_type || null,
    country: ev.country || null,
    admin1: ev.admin1 || null,
    location: ev.location || null,
    lat,
    lon,
    chokepoint: chokepointFor(lat, lon),
    actor1: ev.actor1 || null,
    actor2: ev.actor2 || null,
    fatalities: Number(ev.fatalities) || 0,
    notes: (ev.notes || "").slice(0, 400),
    source: ev.source || null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const email = process.env.ACLED_EMAIL;
    const password = process.env.ACLED_PASSWORD;
    if (!email || !password) return res.status(500).json({ error: "ACLED_EMAIL/PASSWORD missing" });

    const daysParam = Math.max(1, parseInt(req.query?.days || "365", 10));
    const endDate = todayIso();
    const startDate = isoDaysAgo(daysParam);

    const access = await exchangeToken(email, password);

    const results = await Promise.allSettled(
      REGION_COUNTRIES.map((c) => fetchCountryEvents(access, c, startDate, endDate, 1000))
    );

    const errors = {};
    const allEvents = [];
    results.forEach((r, i) => {
      const country = REGION_COUNTRIES[i];
      if (r.status === "fulfilled") {
        if (r.value.error) errors[country] = r.value.error;
        else allEvents.push(...r.value.data);
      } else {
        errors[country] = r.reason?.message || "rejected";
      }
    });

    // Filter to maritime-relevant events, dedupe by event_id_cnty, sort newest first.
    const seen = new Set();
    const incidents = allEvents
      .filter(isMaritime)
      .map(normalize)
      .filter((e) => {
        if (!e.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 500);

    const news = await fetchGoogleNews();

    // Per-chokepoint aggregates for quick UI rendering.
    const byChokepoint = {};
    for (const c of CHOKEPOINT_BOXES) byChokepoint[c.name] = { incidents: 0, fatalities: 0, latest: null };
    for (const ev of incidents) {
      if (!ev.chokepoint) continue;
      const bucket = byChokepoint[ev.chokepoint];
      bucket.incidents += 1;
      bucket.fatalities += ev.fatalities || 0;
      if (!bucket.latest || ev.date > bucket.latest) bucket.latest = ev.date;
    }

    if (incidents.length === 0 && Object.keys(errors).length === REGION_COUNTRIES.length) {
      return res.status(502).json({ error: "all country fetches failed", errors });
    }

    const fetchedAt = new Date().toISOString();
    await putJSON(BLOB_PATH, {
      incidents,
      byChokepoint,
      countries: REGION_COUNTRIES,
      chokepoints: CHOKEPOINT_BOXES.map((c) => c.name),
      news,
      meta: {
        windowDays: daysParam,
        fetchedAt,
        newsFetchedAt: fetchedAt,
        errors: Object.keys(errors).length ? errors : undefined,
      },
      windowDays: daysParam,
      fetchedAt,
      errors: Object.keys(errors).length ? errors : undefined,
    });

    return res.status(200).json({
      ok: true,
      incidentCount: incidents.length,
      countriesFetched: REGION_COUNTRIES.length - Object.keys(errors).length,
      errors: Object.keys(errors).length ? errors : undefined,
      fetchedAt,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "unknown" });
  }
}
