// Monthly refresh of central bank policy-rate snapshot. Pulls from BIS
// central-bank policy rates page. Best-effort: if scrape fails, preserves
// the last-good Blob. Falls back to the bundled static JSON if the Blob
// has never been seeded.
import { put, head } from "@vercel/blob";

const BLOB_PATH = "global/central-banks.json";
const BIS_URL = "https://www.bis.org/statistics/cbpol.htm";

const BIS_TO_CODE = {
  "united states": "US",
  "euro area": "EU",
  "united kingdom": "GB",
  "japan": "JP",
  "china": "CN",
  "canada": "CA",
  "australia": "AU",
  "switzerland": "CH",
  "india": "IN",
};

function normalize(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

async function fetchBisRates() {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return {};
  const url = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(BIS_URL)}&render_js=false&premium_proxy=true`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return {};
    const html = await resp.text();
    const rates = {};
    // Look for pattern: <td>Country Name</td>...<td>X.XX</td>
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const row = m[1];
      const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
      if (cellMatches.length < 2) continue;
      const name = normalize(cellMatches[0]);
      const code = BIS_TO_CODE[name];
      if (!code) continue;
      for (const cell of cellMatches.slice(1)) {
        const num = cell.match(/(-?\d+\.\d{1,3})/);
        if (num) { rates[code] = parseFloat(num[1]); break; }
      }
    }
    return rates;
  } catch {
    return {};
  }
}

async function loadLastGood(token) {
  try {
    const meta = await head(BLOB_PATH, { token });
    const resp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

    const scraped = await fetchBisRates();
    const prior = await loadLastGood(token);
    const priorBanks = prior?.banks || [];

    // Merge: keep prior shape, update currentRate if scraped value differs.
    const banks = priorBanks.length
      ? priorBanks.map((b) => {
          const rate = scraped[b.countryCode];
          if (rate != null && Math.abs(rate - b.currentRate) > 0.001) {
            return { ...b, currentRate: rate, lastRefresh: new Date().toISOString().slice(0, 10) };
          }
          return b;
        })
      : [];

    const scrapeCount = Object.keys(scraped).length;
    if (!banks.length && scrapeCount < 3) {
      return res.status(502).json({ error: "no prior Blob and scrape returned <3 countries" });
    }

    const body = {
      banks,
      scrapedCount: scrapeCount,
      source: "BIS central-bank policy rates via ScrapingBee",
      fetchedAt: new Date().toISOString(),
    };
    await put(BLOB_PATH, JSON.stringify(body), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({ ok: true, scrapedCount: scrapeCount, bankCount: banks.length });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "unknown" });
  }
}
