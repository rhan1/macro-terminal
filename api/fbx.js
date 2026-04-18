// Discovery-heavy scraper for global container pricing.
// Probe order: A) current Freightos Terminal landing page, B) legacy FBX URL,
// C) Baltic Exchange public page, D) Drewry WCI fallback, E) Wayback snapshots.
// Freightos currently exposes usable headline/ticker/chart data via inline JS;
// Wayback is used only as a best-effort history backfill when live history is short.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACCEPT = "application/json, text/html;q=0.9, */*;q=0.8";
const CACHE = "s-maxage=86400, stale-while-revalidate=172800";
const URLS = {
  freightos:
    "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/",
  legacy: "https://fbx.freightos.com/freightos-baltic-index/",
  baltic:
    "https://www.balticexchange.com/en/data-services/market-information0/indices.html",
  drewry:
    "https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry",
};

const baseHeaders = { "User-Agent": UA, Accept: ACCEPT };
function makeError(sourceUrl, error) {
  return {
    source: "Freightos Baltic Index",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    error,
    latest: null,
    history: [],
  };
}
async function fetchText(url) {
  const resp = await fetch(url, { headers: baseHeaders, signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`Upstream HTTP ${resp.status}`);
  return await resp.text();
}
function parseJsonAssignment(html, key) {
  const m = html.match(new RegExp(`window\\.${key}[^=]*=\\s*(\\[[\\s\\S]*?\\]);`));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
function num(v) {
  const n = Number(String(v).replace(/[$,%\s,]+/g, ""));
  return Number.isFinite(n) ? n : null;
}
function pct(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function uniqHistory(points) {
  const map = new Map();
  for (const p of points || []) {
    if (!p?.date || !Number.isFinite(p?.value)) continue;
    map.set(p.date, { date: p.date, value: p.value });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function computeYoy(history) {
  if (!history?.length) return null;
  const latest = history[history.length - 1];
  const target = new Date(`${latest.date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() - 364);
  let best = null;
  let bestDiff = Infinity;
  for (const p of history) {
    const diff = Math.abs(new Date(`${p.date}T00:00:00Z`) - target);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  if (!best || best.date === latest.date || best.value === 0 || bestDiff > 35 * 86400000) return null;
  return Number((((latest.value - best.value) / best.value) * 100).toFixed(1));
}
function buildFreightosResult(html, sourceUrl) {
  const historyRaw = parseJsonAssignment(html, "frProductIntroChartData");
  const tickerRaw = parseJsonAssignment(html, "frProductIntroTickerData");
  const history = uniqHistory(
    (historyRaw || []).map((p) => ({ date: p.indexDate, value: Number(p.value) }))
  );
  const ticker = (tickerRaw || []).find((x) => x.label === "FBX") || null;
  const valueMatch = html.match(/<span class="fr-value-amount">\$(.*?)<\/span>/i);
  const latestValue = num(valueMatch?.[1]) ?? history.at(-1)?.value ?? null;
  const latestDate = history.at(-1)?.date ?? null;
  const derivedDay =
    history.length > 1
      ? Number((((history.at(-1).value - history.at(-2).value) / history.at(-2).value) * 100).toFixed(2))
      : null;
  const dayChangePct = pct(ticker?.change) ?? derivedDay;
  if (latestValue == null) return null;
  return {
    source: "Freightos Baltic Index",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    latest: {
      value: latestValue,
      period: fmtDate(latestDate),
      dayChangePct,
      yoyPct: computeYoy(history),
      direction: dayChangePct == null || dayChangePct === 0 ? null : dayChangePct > 0 ? "up" : "down",
    },
    history,
  };
}
function buildDrewryResult(html) {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  const desc = html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || "";
  const period = title.match(/-\s*([0-9]{1,2}\s+[A-Z][a-z]{2})/)?.[1];
  const value = num(desc.match(/\$([0-9.,]+)/)?.[1]);
  const dayChangePct = pct(desc.match(/(rises?|gains?|slips?|falls?)\s+([0-9.]+)%/i)?.[2]);
  if (!period || dayChangePct == null || value == null) return null;
  return {
    source: "Drewry WCI",
    sourceUrl: URLS.drewry,
    fetchedAt: new Date().toISOString(),
    latest: {
      value,
      period,
      dayChangePct: /slips?|falls?/i.test(desc) ? -Math.abs(dayChangePct) : Math.abs(dayChangePct),
      yoyPct: null,
      direction: /slips?|falls?/i.test(desc) ? "down" : "up",
    },
    history: [],
  };
}
async function backfillViaWayback(result, targetUrl) {
  if (!result?.history?.length || result.history.length >= 40) return result;
  try {
    const cdxUrl =
      "https://web.archive.org/cdx/search/cdx?output=json&fl=timestamp&filter=statuscode:200&limit=120&url=" +
      encodeURIComponent(targetUrl);
    const rows = JSON.parse(await fetchText(cdxUrl));
    if (!Array.isArray(rows) || rows.length < 3) return result;
    const picked = [];
    for (let i = 1; i < rows.length; i += Math.max(1, Math.floor((rows.length - 1) / 6))) {
      picked.push(rows[i][0]);
    }
    let merged = result.history;
    for (const ts of picked.slice(0, 6)) {
      try {
        const html = await fetchText(`https://web.archive.org/web/${ts}/${targetUrl}`);
        const parsed = buildFreightosResult(html, targetUrl);
        if (parsed?.history?.length) merged = uniqHistory([...merged, ...parsed.history]);
      } catch {}
    }
    merged = merged.slice(-52);
    return {
      ...result,
      latest: { ...result.latest, yoyPct: computeYoy(merged) ?? result.latest.yoyPct },
      history: merged,
    };
  } catch {
    return result;
  }
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", CACHE);
  let result = null;
  let lastError = "No usable FBX data found";

  try {
    const html = await fetchText(URLS.freightos);
    result = buildFreightosResult(html, URLS.freightos);
  } catch (err) {
    lastError = err?.message || lastError;
  }

  if (!result) {
    try {
      const html = await fetchText(URLS.legacy);
      result = buildFreightosResult(html, URLS.legacy);
    } catch (err) {
      lastError = err?.message || lastError;
    }
  }

  if (!result) {
    try {
      await fetchText(URLS.baltic);
    } catch (err) {
      lastError = err?.message || lastError;
    }
  }

  if (!result) {
    try {
      const html = await fetchText(URLS.drewry);
      result = buildDrewryResult(html);
    } catch (err) {
      lastError = err?.message || lastError;
    }
  }

  if (result?.source === "Freightos Baltic Index") {
    result = await backfillViaWayback(result, URLS.freightos);
  }

  if (!result) return res.status(200).json(makeError(URLS.freightos, lastError));
  return res.status(200).json(result);
}
