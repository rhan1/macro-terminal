const INSIGHTS_URL = "https://www.coxautoinc.com/insights/manheim-used-vehicle-value-index/";
const NEWSROOM_URL = "https://www.coxautoinc.com/newsroom/";
const MANHEIM_URL = "https://publish.manheim.com/en/services/consulting/used-vehicle-value-index.html";
const SEARCH_URL = "https://www.coxautoinc.com/wp-json/wp/v2/search?search=Manheim%20Used%20Vehicle%20Value%20Index&per_page=20";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;|&#160;|&#8239;/g, " ");
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " "));
}

function cleanText(s) {
  return stripTags(s).replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
}

function toNum(s) {
  const n = parseFloat(String(s || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchText(url) {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Upstream HTTP ${resp.status}`);
  return { url: resp.url, text: await resp.text() };
}

function findLinks(html, baseUrl) {
  const seen = new Set();
  const urls = [];
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    try {
      const url = new URL(decodeEntities(m[1]), baseUrl).toString();
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch (_) {}
  }
  return urls;
}

function scoreUrl(url) {
  if (!/manheim|muvvi/i.test(url)) return -1;
  let score = /mid-/i.test(url) ? 5 : 10;
  if (/manheim-used-vehicle-value-index/i.test(url)) score += 5;
  if (/-muvvi\/?$/i.test(url)) score += 3;
  return score;
}

function periodFrom(title, text, url) {
  const monthRe = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i;
  const titleMatch = String(title || "").match(/(?:Mid-)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i);
  if (titleMatch) return `${titleMatch[1]} ${titleMatch[2]}`;
  const slugMatch = String(url || "").match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z-]*-(20\d{2})/i);
  const map = { jan: "January", january: "January", feb: "February", february: "February", mar: "March", march: "March", apr: "April", april: "April", may: "May", jun: "June", june: "June", jul: "July", july: "July", aug: "August", august: "August", sep: "September", sept: "September", september: "September", oct: "October", october: "October", nov: "November", november: "November", dec: "December", december: "December" };
  if (slugMatch) return `${map[slugMatch[1].toLowerCase()]} ${slugMatch[2]}`;
  const textMatch = String(text || "").match(monthRe);
  if (textMatch) return `${textMatch[1]} ${textMatch[2]}`;
  return "";
}

function parseSignedPct(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const first = toNum(m[1]);
    const second = toNum(m[2]);
    const value = first != null ? first : second;
    const word = typeof m[1] === "string" && first == null ? m[1].toLowerCase() : typeof m[2] === "string" && second == null ? m[2].toLowerCase() : "";
    if (value == null) continue;
    return /decrease|declin|fell|drop|down|lost|lower/.test(word) ? -value : value;
  }
  return null;
}

function parseRelease(html, sourceUrl) {
  const title = decodeEntities((html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || "").replace(/\s*[|–—-].*$/, "").trim();
  const bodyHtml = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [])[1] || html;
  const text = cleanText(bodyHtml);
  const indexPatterns = [
    /(?:Manheim Used Vehicle Value Index\s*\(MUVVI\)|MUVVI)[^.\n]{0,40}?(?:rose|fell|dropped|climbed|was|stood at|increased to|decreased to|came in at|reached)\s+to?\s*([\d.]+)/i,
    /(?:MUVVI|Manheim[^.\n]{0,80}?Index)\s+(?:rose|fell|dropped|climbed|was|stood at|increased to|decreased to|came in at|reached)\s+to?\s*([\d.]+)/i,
    /index(?:\s+was|\s+stood at|\s+came in at|\s+reached|\s+rose to|\s+fell to|\s+decreased to|\s+increased to|\s+of)\s*([\d.]+)/i,
    /\bUVVI[^.\n]{0,40}?([\d.]+)/i,
  ];
  let index = null;
  for (const re of indexPatterns) {
    const m = text.match(re);
    if (m) {
      index = toNum(m[1]);
      if (index != null) break;
    }
  }
  const momPct = parseSignedPct(text, [
    /\b(up|down)\s+([\d.]+)%\s+month[- ]over[- ]month/i,
    /reflecting a\s+([\d.]+)%\s+(increase|decrease|decline|drop)[^.]{0,120}compared to\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b(?!\s+20\d{2})/i,
    /(?:increased|rose|climbed|gained|decreased|fell|declined|dropped|lost)\s+([\d.]+)%\s+(?:in|from)\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?/i,
  ]);
  const yoyPct = parseSignedPct(text, [
    /reflecting a\s+([\d.]+)%\s+(increase|decrease|decline|drop)[^.]{0,160}compared to\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i,
    /(?:Manheim Used Vehicle Value Index\s*\(MUVVI\)|MUVVI)[^.]{0,240}?([\d.]+)%\s+(increase|decrease|decline|drop)[^.]{0,120}compared to\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i,
    /(?:MUVVI|Manheim[^.]{0,80}?Index)[^.]{0,240}?([\d.]+)%\s+(increase|decrease|decline|drop)[^.]{0,120}compared to\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i,
    /(?:MUVVI|Manheim[^.]{0,80}?Index)[^.]{0,240}?\b(up|down)\s+([\d.]+)%\s+year[- ]over[- ]year/i,
  ]);
  const period = periodFrom(title, text, sourceUrl);
  return {
    title,
    latest: {
      index,
      period,
      momPct,
      yoyPct,
      direction: momPct == null ? null : momPct > 0 ? "up" : momPct < 0 ? "down" : null,
    },
  };
}

async function discoverFromInsights() {
  const { text } = await fetchText(INSIGHTS_URL);
  const links = findLinks(text, INSIGHTS_URL).filter((u) => scoreUrl(u) > 0);
  const search = JSON.parse((await fetchText(SEARCH_URL)).text);
  for (const item of search) if (item?.url) links.push(item.url);
  const ordered = [...new Set(links)]
    .filter((u) => !/call|replay|q[1-4]-\d{4}-muvvi/i.test(u))
    .sort((a, b) => scoreUrl(b) - scoreUrl(a));
  const preferred = ordered.find((u) => /manheim-used-vehicle-value-index-(?!mid-).+trends/i.test(u)) || ordered.find((u) => !/mid-/i.test(u)) || ordered[0];
  if (!preferred) throw new Error("No release link found");
  return { sourceUrl: preferred, historySeed: search };
}

async function discoverFromNewsroom() {
  const { text } = await fetchText(NEWSROOM_URL);
  const links = findLinks(text, NEWSROOM_URL).filter((u) => scoreUrl(u) > 0 && !/mid-/i.test(u));
  if (!links.length) throw new Error("No newsroom release link found");
  return { sourceUrl: links.sort((a, b) => scoreUrl(b) - scoreUrl(a))[0], historySeed: [] };
}

async function discoverFromManheim() {
  return { sourceUrl: MANHEIM_URL, historySeed: [] };
}

async function discoverFromWayback() {
  const cdx = await fetchText("https://web.archive.org/cdx/search/cdx?url=www.coxautoinc.com/*manheim-used-vehicle-value-index*&from=2024&filter=statuscode:200&limit=20&fl=timestamp,original&output=json");
  const rows = JSON.parse(cdx.text).slice(1).reverse();
  if (!rows.length) throw new Error("No Wayback snapshot found");
  return { sourceUrl: `https://web.archive.org/web/${rows[0][0]}/${rows[0][1]}`, historySeed: [] };
}

async function buildHistory(seed) {
  const monthish = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)/i;
  const list = Array.isArray(seed) && seed.length ? seed : JSON.parse((await fetchText(`${SEARCH_URL}&page=2`)).text);
  const all = Array.isArray(seed) && seed.length ? [...seed, ...JSON.parse((await fetchText(`${SEARCH_URL}&page=2`)).text)] : list;
  const urls = [...new Set(all
    .filter((x) => x?.url && x?.title && /manheim|muvvi/i.test(`${x.title} ${x.url}`) && !/mid-|call|replay|q[1-4]/i.test(`${x.title} ${x.url}`) && monthish.test(`${x.title} ${x.url}`))
    .map((x) => x.url)
  )].slice(0, 10);
  const history = [];
  const seenPeriods = new Set();
  for (const url of urls) {
    try {
      const { text } = await fetchText(url);
      const parsed = parseRelease(text, url);
      if (parsed.latest.index != null && parsed.latest.period && !seenPeriods.has(parsed.latest.period)) {
        seenPeriods.add(parsed.latest.period);
        history.push({ period: parsed.latest.period, index: parsed.latest.index });
      }
    } catch (_) {}
  }
  return history;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");
  const base = {
    source: "Manheim / Cox Automotive",
    sourceUrl: "",
    fetchedAt: new Date().toISOString(),
    latest: null,
    history: [],
  };

  try {
    let discovered = null;
    for (const step of [discoverFromInsights, discoverFromNewsroom, discoverFromManheim, discoverFromWayback]) {
      try {
        discovered = await step();
        if (discovered?.sourceUrl) break;
      } catch (_) {}
    }
    if (!discovered?.sourceUrl) {
      return res.status(200).json({ ...base, error: "No release source found" });
    }

    const release = await fetchText(discovered.sourceUrl);
    const parsed = parseRelease(release.text, release.url);
    if (parsed.latest?.index == null) {
      return res.status(200).json({ ...base, sourceUrl: release.url, error: "Regex miss on INDEX field" });
    }

    const history = /coxautoinc\.com/i.test(release.url) ? await buildHistory(discovered.historySeed) : [];
    return res.status(200).json({
      ...base,
      sourceUrl: release.url,
      latest: parsed.latest,
      history,
    });
  } catch (err) {
    return res.status(200).json({ ...base, error: err?.message || "Unknown error" });
  }
}
