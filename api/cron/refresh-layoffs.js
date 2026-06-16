import { putJSON } from "../../netlify/lib/netlify-blob.mjs";
const RSS_URL = "https://news.google.com/rss/search?q=layoffs+company&hl=en-US&gl=US&ceid=US:en";
const SEC_Q = '"workforce reduction" OR "reduction in force" OR "restructuring"';
const SEC_UA = "Macro Terminal macro-terminal-bice.vercel.app <https://github.com/rhan1/macro-terminal>";
const MODEL = "claude-haiku-4-5-20251001";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}
function stripTags(s) { return decodeEntities(String(s || "").replace(/<[^>]+>/g, "").trim()); }
function splitTitleAndSource(raw) {
  const title = decodeEntities(raw);
  const sepIdx = title.lastIndexOf(" - ");
  if (sepIdx > 0 && sepIdx > title.length - 60) return { title: title.slice(0, sepIdx).trim(), source: title.slice(sepIdx + 3).trim() };
  return { title, source: "" };
}
function truncateText(s, max = 8000) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function stripHtmlToText(html) {
  return truncateText(
    decodeEntities(
      String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}
async function fetchArticleBody(url, headers = {}) {
  if (!url) return "";
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!resp.ok) return "";
    return stripHtmlToText(await resp.text());
  } catch {
    return "";
  }
}
function parseRssItems(xml, limit) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return mm ? mm[1].replace(/^<!\[CDATA\[|]]>$/g, "").trim() : "";
    };
    const rawTitle = pick("title");
    if (!rawTitle) continue;
    const { title, source } = splitTitleAndSource(rawTitle);
    const pubDate = pick("pubDate");
    const description = stripTags(pick("description"));
    const explicitSource = decodeEntities(pick("source"));
    const d = pubDate ? new Date(pubDate) : null;
    items.push({ title, source: explicitSource || source, url: pick("link"), date: d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null, description });
  }
  return items;
}
function parseSecHits(json, limit) {
  return (json?.hits?.hits || []).slice(0, limit).map((hit) => {
    const src = hit?._source || {};
    const display = src.display_names?.[0] || "";
    const tickerGuess = display.match(/\(([A-Z]{1,5})\)/)?.[1] || null;
    const cik = src.ciks?.[0] || null;
    return { entityName: display.replace(/\s*\([A-Z]{1,5}\)\s*\(CIK [^)]+\)\s*$/, "").trim() || display, tickerGuess, cik, fileDate: src.file_date ? String(src.file_date).slice(0, 10) : null, adsh: src.adsh || null, excerpt: hit?._id || src.adsh || null, filingUrl: cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=40` : null };
  });
}
function isoWeekKey(dateIso) {
  const d = new Date(`${dateIso || todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = Math.ceil((((d - jan4) / 86400000) + jan4.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function inWindow(dateIso, startIso, endIso) { return !!dateIso && dateIso >= startIso && dateIso <= endIso; }

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    const backfillRaw = Array.isArray(req.query?.backfill) ? req.query.backfill[0] : req.query?.backfill;
    const backfill = Math.max(1, parseInt(backfillRaw || "60", 10) || 60);
    const startDt = isoDaysAgo(backfill);
    const endDt = todayIso();
    const [rssResp, secResp] = await Promise.all([
      fetch(RSS_URL, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(8000) }),
      fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(SEC_Q)}&forms=8-K&dateRange=custom&startdt=${startDt}&enddt=${endDt}`, { headers: { "User-Agent": SEC_UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }),
    ]);
    const rawNews = rssResp.ok ? parseRssItems(await rssResp.text(), 20) : [];
    const secHits = secResp.ok ? parseSecHits(await secResp.json(), 40) : [];
    const newsInputs = await Promise.all(rawNews.map(async (x) => ({
      ...x,
      itemType: "NEWS",
      source_url: x.url || null,
      articleBody: truncateText(await fetchArticleBody(x.url, { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" }) || `${x.title}\n${x.description || ""}`),
    })));
    const secInputs = await Promise.all(secHits.map(async (x) => ({
      ...x,
      itemType: "SEC 8-K",
      source_url: x.filingUrl || null,
      articleBody: truncateText(await fetchArticleBody(x.filingUrl, { "User-Agent": SEC_UA, Accept: "text/html,application/xhtml+xml" }) || `${x.entityName} ${x.tickerGuess ? `(${x.tickerGuess})` : ""}\n${x.excerpt || ""}`),
    })));
    const promptLines = [
      `Inputs to structure (${newsInputs.length + secInputs.length} items):`,
      ...newsInputs.map((x, i) => [
        `Input ${i + 1}: NEWS | ${x.title} | source: ${x.source || "?"} | date: ${x.date || "?"}`,
        `SOURCE_URL: ${x.source_url || "null"}`,
        `Article body: ${x.articleBody || x.title || ""}`,
      ].join("\n")),
      ...secInputs.map((x, i) => [
        `Input ${newsInputs.length + i + 1}: SEC 8-K | ${x.entityName} (ticker: ${x.tickerGuess || "?"}) | filed: ${x.fileDate || "?"}`,
        `SOURCE_URL: ${x.source_url || "null"}`,
        `Article body: ${x.articleBody || x.excerpt || x.entityName || ""}`,
      ].join("\n")),
    ];
    const combinedDates = [...newsInputs.map((x) => x.date), ...secInputs.map((x) => x.fileDate)];
    let structured = [];
    let droppedGeneric = 0;
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: 'You structure raw layoff news into JSON. For each input item, output an object with: company (string — the actual proper-noun company name, e.g. "Meta Platforms", "Wells Fargo", "Shutterfly". If the source text does NOT contain a specific named company (generic descriptions like "a school bus company" or "an oil field operator"), omit the item entirely rather than emit the generic description as the company), ticker (string | null — uppercase stock symbol if the company is PUBLICLY TRADED on a US exchange, else null), headcount (integer | null — number of employees laid off), pct_workforce (number | null — percentage of workforce if stated), sector (string | null — one of: Tech, Finance, Retail, Healthcare, Media, Energy, Industrial, Transportation, Consumer, Real Estate, Other), announcement_date (ISO yyyy-mm-dd | null), source_url (string | null — pass through the SOURCE_URL provided for that input exactly as given; do NOT invent or modify a URL). Do NOT invent numbers. Do NOT invent or paraphrase company names — if no specific company is named, drop the item. Few-shot examples for company: GOOD: "Meta Platforms", "Wells Fargo", "Shutterfly", "Tesla". BAD: "School bus company", "Transportation firm", "An oil field operator", "A tech startup", "Retail chain". If the company name would match the regex /^(a |an )?(.+ (company|firm|chain|operator|startup|giant|maker|provider|retailer|manufacturer))$/i, do NOT emit the item. Company names must be proper nouns (begin with a capital letter and be specifically identifiable). If you cannot find a specific proper-noun company name in the source, drop the item. Use null for anything not explicitly stated in the input. Return ONLY a JSON object { items: [...] } with no markdown or commentary.',
        messages: [{ role: "user", content: promptLines.join("\n") }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (anthropicResp.ok) {
      const payload = await anthropicResp.json();
      const text = payload?.content?.[0]?.text?.trim?.() || "";
      const clean = text.replace(/^```json\s*|^```\s*|\s*```$/g, "").trim();
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed?.items)) {
          const genericCompanyPattern = /^(a |an )?(.+ (company|firm|chain|operator|startup|giant|maker|provider|retailer|manufacturer))$/i;
          structured = parsed.items
            .map((item, i) => ({ company: String(item?.company || "").trim(), ticker: item?.ticker ? String(item.ticker).trim().toUpperCase() : null, headcount: Number.isFinite(item?.headcount) ? Math.round(item.headcount) : null, pct_workforce: Number.isFinite(item?.pct_workforce) ? item.pct_workforce : null, sector: item?.sector || null, announcement_date: item?.announcement_date || null, source_url: item?.source_url ? String(item.source_url).trim() : null, sourceDate: combinedDates[i] || null }))
            .filter((x) => {
              const company = x.company.trim();
              const hasCapital = /[A-Z]/.test(company);
              const isGeneric = genericCompanyPattern.test(company);
              const isAllLowercase = company && company.toLowerCase() === company && !hasCapital;
              if (isGeneric || isAllLowercase) {
                droppedGeneric += 1;
                return false;
              }
              return true;
            })
            .filter((x) => x.company);
          console.log(`[refresh-layoffs] dropped generic company items: ${droppedGeneric}`);
        }
      } catch {}
    }
    const seen = new Set();
    structured = structured.filter((item) => {
      const key = `${item.company.toLowerCase()}-${isoWeekKey(item.announcement_date || item.sourceDate || endDt)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const tickers = [...new Set(structured.map((x) => x.ticker).filter(Boolean))];
    let market = {};
    if (tickers.length) {
      // Call our own /api/market proxy so Yahoo rate-limits hit the cached
      // edge instead of the raw Yahoo endpoint. Use the stable public hostname
      // because `VERCEL_URL` returns a per-deployment URL that's sometimes not
      // routable at cron execution time.
      const base = `https://macro-terminal-bice.vercel.app/api/market`;
      try {
        const qr = await fetch(`${base}?symbols=${encodeURIComponent(tickers.join(","))}`, { signal: AbortSignal.timeout(10000) });
        if (qr.ok) market = await qr.json();
      } catch {}
      await Promise.all(tickers.map(async (ticker) => {
        if (!market[ticker]) market[ticker] = { price: null, changePct: null };
        try {
          const cr = await fetch(`${base}?chart=${encodeURIComponent(ticker)}&range=1mo`, { signal: AbortSignal.timeout(10000) });
          if (!cr.ok) { market[ticker].chart = []; return; }
          const cj = await cr.json();
          market[ticker].chart = Array.isArray(cj?.points) ? cj.points : [];
          if (market[ticker].price == null && cj?.meta?.price != null) market[ticker].price = cj.meta.price;
          if (market[ticker].changePct == null && cj?.meta?.changePct != null) market[ticker].changePct = cj.meta.changePct;
        } catch {
          market[ticker].chart = [];
        }
      }));
      structured = structured.map((item) => item.ticker && market[item.ticker] ? { ...item, marketData: market[item.ticker] } : item);
    }
    if (structured.length < 3 && secHits.length < 3) {
      return res.status(502).json({ error: "not enough structured rows" });
    }
    const last30Start = isoDaysAgo(30), prior30Start = isoDaysAgo(60), prior30End = isoDaysAgo(31);
    const withDates = structured.map((x) => ({ ...x, effectiveDate: x.announcement_date || x.sourceDate || null }));
    const last30 = withDates.filter((x) => inWindow(x.effectiveDate, last30Start, endDt));
    const prior30 = withDates.filter((x) => inWindow(x.effectiveDate, prior30Start, prior30End));
    const sumHead = (arr) => arr.reduce((n, x) => n + (x.headcount || 0), 0);
    const sectorMap = {};
    for (const item of last30) {
      const k = item.sector || "Other";
      sectorMap[k] ||= { sector: k, companies: 0, headcount: 0 };
      sectorMap[k].companies += 1;
      sectorMap[k].headcount += item.headcount || 0;
    }
    const sectorBreakdown = Object.values(sectorMap).sort((a, b) => b.headcount - a.headcount);
    const totalCompanies30d = last30.length;
    const totalHeadcount30d = sumHead(last30);
    const totalCompaniesPrior30d = prior30.length;
    const totalHeadcountPrior30d = sumHead(prior30);
    const aggregates = {
      totalCompanies30d,
      totalHeadcount30d,
      totalCompaniesPrior30d,
      totalHeadcountPrior30d,
      deltaCompaniesPct: ((totalCompanies30d - totalCompaniesPrior30d) / Math.max(totalCompaniesPrior30d, 1)) * 100,
      deltaHeadcountPct: ((totalHeadcount30d - totalHeadcountPrior30d) / Math.max(totalHeadcountPrior30d, 1)) * 100,
      sectorBreakdown,
      topSector: sectorBreakdown[0]?.sector || null,
      top10: [...withDates].sort((a, b) => (b.headcount ?? -1) - (a.headcount ?? -1)).slice(0, 10),
    };

    const fetchedAt = new Date().toISOString();
    await putJSON("labor/layoffs-structured.json", { structured, aggregates, rawNews, secHits, fetchedAt, model: MODEL });
    return res.status(200).json({ ok: true, structuredCount: structured.length, rssCount: rawNews.length, secCount: secHits.length, droppedGeneric, fetchedAt, model: MODEL });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
