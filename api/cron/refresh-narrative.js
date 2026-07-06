// Refreshes the Blob-backed market drivers overview by fetching cited macro
// news from Perplexity Sonar Pro, then rewriting it with Anthropic using
// ground-truth market values before overwriting overview/narrative.json.
// Requires PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, and CRON_SECRET.
// Manual invoke:
// curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/refresh-narrative

import { putJSON } from "../../netlify/lib/netlify-blob.mjs";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// NOTE: sonar-reasoning-pro returns <think> reasoning that consumes the token
// budget and leaves near-empty content -> "paragraph too short". sonar-pro is
// the proven model that returns usable prose. (Reverted the stuck-commit upgrade.)
const PERPLEXITY_MODEL = "sonar-pro";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const FINAL_MODEL = `${PERPLEXITY_MODEL}+claude-haiku-4-5`;
const FALLBACK_MODEL = `${PERPLEXITY_MODEL}-fallback`;
// Matched by suffix against the URL hostname (www. and other subdomains included).
const DISALLOWED_CITATION_HOSTNAMES = new Set([
  // Social / video platforms
  "youtube.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "tiktok.com",
  "facebook.com",
  "instagram.com",
  // Event-calendar / tourism / local-promo contaminants observed in prod
  "visitspacecoast.com",
  "delano4th.com",
  "minocqua.org",
  "cmu.edu",
  "fortcollins.gov",
  "sfmta.com",
  "eventbrite.com",
  "meetup.com",
  "tripadvisor.com",
  "yelp.com",
  // Weather
  "weather.com",
  "accuweather.com",
  "wunderground.com",
  "weather.gov",
]);

// Reject any URL whose host+path looks like an event calendar, weather report,
// holiday/tourism promo, or entertainment piece — the classes of contamination
// Perplexity's day-recency web search drags in around holidays.
const NON_FINANCIAL_URL_PATTERN = new RegExp(
  [
    "(?:^|[-_./])events?(?:[-_./]|$)",
    "calendar",
    "weather",
    "forecast",
    "heat[-_]?wave",
    "tourism",
    "things[-_]?to[-_]?do",
    "festival",
    "fireworks",
    "parade",
    "(?:fourth|4th)[-_]?of[-_]?july",
    "july[-_]?(?:4th?|fourth)",
    "golf",
    "recipes?",
    "horoscope",
    "obituar",
    "lottery",
    "celebrit",
    "entertainment",
  ].join("|"),
  "i",
);

// Default-deny allowlist: a citation is kept only when its hostname matches a
// known financial/economic publisher (suffix match) OR its host+path contains
// a financial/economic keyword.
const ALLOWED_FINANCIAL_HOSTNAMES = new Set([
  // Wires & major financial press
  "bloomberg.com", "bnnbloomberg.ca", "reuters.com", "wsj.com", "ft.com",
  "cnbc.com", "marketwatch.com", "barrons.com", "economist.com",
  "finance.yahoo.com", "investing.com", "seekingalpha.com", "morningstar.com",
  "forbes.com", "businessinsider.com", "fortune.com", "axios.com",
  "apnews.com", "marketplace.org", "stocktitan.net", "benzinga.com",
  "fxstreet.com", "kitco.com", "oilprice.com", "tradingeconomics.com",
  "zacks.com", "thestreet.com", "investopedia.com",
  // Official / institutional
  "federalreserve.gov", "stlouisfed.org", "newyorkfed.org", "bls.gov",
  "bea.gov", "treasury.gov", "sec.gov", "cbo.gov", "imf.org",
  "worldbank.org", "oecd.org", "adb.org", "bis.org", "ecb.europa.eu",
  // Asset managers / banks (research notes)
  "apollo.com", "goldmansachs.com", "jpmorgan.com", "morganstanley.com",
  "blackrock.com", "pimco.com", "schwab.com", "fidelity.com", "vanguard.com",
  "ubs.com", "fisherinvestments.com", "hermes-investment.com",
]);

const FINANCIAL_URL_KEYWORD_PATTERN =
  /market|stock|equit|invest|econom|financ|business|trading|treasur|bond|yield|rates?\b|fed\b|fomc|inflation|tariff|earnings|macro|monetar|banking|crypto|commodit|currenc|forex|gdp\b|payroll|labor[-_]market/i;
// Example: sanitizeParagraph("S&P 500 above 7,150", { "S&P 500": 7101 }) should replace "7,150" with "7,101"

const SANITIZER_CONFIG = {
  "S&P 500": {
    tolerance: 50,
    format: (value) => Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    }),
    patterns: [
      /\bS&P 500\b\s+(?:at|above|hit|hits|reached|reaches|near|around|crossed|just crossed|breached|breaching|to a (?:new )?(?:record )?high (?:of|at|above|near)?)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
      /\bS&P 500\s+(?:was|is|stood at)\s+\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  SPY: {
    tolerance: 5,
    format: (value) => Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\bSPY\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  QQQ: {
    tolerance: 5,
    format: (value) => Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\bQQQ\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  VIX: {
    tolerance: 3,
    format: (value) => Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\bVIX\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  "10Y": {
    tolerance: 0.25,
    format: (value) => Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\b(?:10Y|10-year|10 year|10-year Treasury yield|10 year Treasury yield)\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  "Fed funds": {
    tolerance: 0.15,
    format: (value) => Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\b(?:fed(?:eral)? funds(?: effective| target)? rate|effective fed(?:eral)? funds rate|DFF)\b\s+(?:at|above|below|near|around|of|is|was|stood at|currently at|holding at)\s*(\d+(?:\.\d+)?)/gi,
    ],
  },
  Gold: {
    tolerance: 30,
    format: (value) => Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\b(?:Gold|GLD)\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
  Oil: {
    tolerance: 5,
    format: (value) => Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    }),
    patterns: [
      /\b(?:Oil|WTI oil|USO)\b\s+(?:at|above|below|near|around|hit|hits|reached|reaches|closed at|traded at|was|is|stood at)\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi,
    ],
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseJsonObject(text) {
  const clean = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function normalizeSources(urls, titleByUrl) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter(Boolean).map((url) => String(url).trim()))]
    .map((url) => ({ url, title: titleByUrl?.get(url) ?? null }));
}

// Perplexity's `search_results` field carries {title, url, date} for each hit;
// the legacy `citations` field is bare URLs. Prefer citations for ordering
// (they align with the [n] markers) and use search_results to recover titles.
function extractCitations(payload) {
  const searchResults = Array.isArray(payload?.search_results) ? payload.search_results : [];
  const titleByUrl = new Map();
  for (const result of searchResults) {
    const url = result?.url ? String(result.url).trim() : null;
    const title = result?.title ? String(result.title).trim() : null;
    if (url && title && !titleByUrl.has(url)) titleByUrl.set(url, title);
  }
  const citations = Array.isArray(payload?.citations) && payload.citations.length > 0
    ? payload.citations
    : searchResults.map((result) => result?.url).filter(Boolean);
  return { citations, titleByUrl };
}

function hostnameMatchesSet(hostname, set) {
  // Suffix match so "www.reuters.com" and "events.cmu.edu" hit "reuters.com"/"cmu.edu".
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

// Default-deny citation filter: drop disallowed hosts and event/weather/
// entertainment-shaped URLs, then require a financial/economic signal
// (allowlisted publisher or financial keyword in host+path).
function isAllowedFinancialSource(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  const hostAndPath = `${hostname}${parsed.pathname}`.toLowerCase();

  if (hostnameMatchesSet(hostname, DISALLOWED_CITATION_HOSTNAMES)) return false;
  if (NON_FINANCIAL_URL_PATTERN.test(hostAndPath)) return false;
  return (
    hostnameMatchesSet(hostname, ALLOWED_FINANCIAL_HOSTNAMES) ||
    FINANCIAL_URL_KEYWORD_PATTERN.test(hostAndPath)
  );
}

function sanitizeParagraph(text, lookup) {
  let output = String(text || "");
  let replacements = 0;

  for (const [key, config] of Object.entries(SANITIZER_CONFIG)) {
    const groundTruthValue = lookup?.[key];
    if (groundTruthValue == null || Number.isNaN(Number(groundTruthValue))) continue;

    for (const pattern of config.patterns) {
      output = output.replace(pattern, (match, capturedNumber) => {
        const citedValue = Number(String(capturedNumber).replace(/,/g, ""));
        if (Number.isNaN(citedValue)) return match;
        if (Math.abs(citedValue - Number(groundTruthValue)) <= config.tolerance) return match;

        const formattedGroundTruth = config.format(groundTruthValue);
        const nextMatch = match.replace(capturedNumber, formattedGroundTruth);
        if (nextMatch !== match) replacements += 1;
        return nextMatch;
      });
    }
  }

  if (/\b(?:record high|all-time high)\b/i.test(output)) {
    console.warn("Narrative mentions record-high language without validation support", {
      text: output.slice(0, 240),
    });
  }

  return { text: output, replacements };
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Post-rewrite directional guard: if both SPY and QQQ are down, strip/soften
// any bullish language that slipped through the LLM instruction.
const BULLISH_PATTERN = /\b(rally|rallied|rallying|surge[sd]?|surging|best day(?: since [^,.;]+)?|broad(?:\s+(?:equity\s+)?gains?|ens?\s+rally|[-\s]based\s+gains?))\b/gi;
const BULLISH_REPLACEMENT_MAP = {
  rally: "decline",
  rallied: "fell",
  rallying: "falling",
  surge: "drop",
  surged: "dropped",
  surges: "drops",
  surging: "dropping",
  "best day": "notable session",
  "broad gains": "broad losses",
  "broad equity gains": "broad equity losses",
  "broadens rally": "extends losses",
  "broadens the rally": "extends the decline",
  "broad-based gains": "broad-based losses",
};

function stripBullishLanguage(text) {
  let changed = false;
  const result = text.replace(BULLISH_PATTERN, (match) => {
    const lower = match.toLowerCase();
    // Try exact replacement first
    if (BULLISH_REPLACEMENT_MAP[lower]) {
      changed = true;
      return BULLISH_REPLACEMENT_MAP[lower];
    }
    // For "best day since …" patterns, replace the whole captured phrase with "notable session"
    if (lower.startsWith("best day")) {
      changed = true;
      return "notable session";
    }
    // Generic fallback: flag that bullish language was found and soften
    changed = true;
    return "pullback";
  });
  return { text: result, changed };
}

// Fed-stance guard: when the fed funds effective rate (DFF) has been falling
// over the past year — an easing cycle — hawkish/tightening framing is a
// factual contradiction. Strip/replace it analogously to the bullish guard.
// "tightening" is only matched in explicit policy contexts (never bare) so
// legitimate phrases like "credit spreads tightening" are untouched.
const HAWKISH_PATTERN = /\b(hawkish(?:ly|ness)?|rate[ -]hikes?|(?:fed|fomc|policy|monetary)\s+tightening|tightening\s+(?:cycle|bias|stance|path|campaign)|hiking\s+cycle|(?:raise|raising|hike|hiking)\s+(?:interest\s+)?rates)\b/gi;
const HAWKISH_REPLACEMENT_MAP = {
  hawkish: "dovish",
  hawkishly: "dovishly",
  hawkishness: "dovishness",
  "rate hike": "rate cut",
  "rate hikes": "rate cuts",
  "rate-hike": "rate-cut",
  "rate-hikes": "rate-cuts",
  "hiking cycle": "cutting cycle",
  "tightening cycle": "easing cycle",
  "tightening bias": "easing bias",
  "tightening stance": "easing stance",
  "tightening path": "easing path",
  "tightening campaign": "easing campaign",
  "fed tightening": "Fed easing",
  "fomc tightening": "FOMC easing",
  "policy tightening": "policy easing",
  "monetary tightening": "monetary easing",
  "raise rates": "cut rates",
  "raising rates": "cutting rates",
  "hike rates": "cut rates",
  "hiking rates": "cutting rates",
  "raise interest rates": "cut interest rates",
  "raising interest rates": "cutting interest rates",
  "hike interest rates": "cut interest rates",
  "hiking interest rates": "cutting interest rates",
};

function stripHawkishLanguage(text) {
  let changed = false;
  const result = text.replace(HAWKISH_PATTERN, (match) => {
    changed = true;
    const lower = match.toLowerCase().replace(/\s+/g, " ");
    if (HAWKISH_REPLACEMENT_MAP[lower]) return HAWKISH_REPLACEMENT_MAP[lower];
    // Generic fallback: neutralize any unmapped variant
    return "easing-cycle policy";
  });
  return { text: result, changed };
}

async function parseErrorBody(response) {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!perplexityKey) return res.status(500).json({ error: "PERPLEXITY_API_KEY not configured" });
    if (!anthropicKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

    // --- Fetch ground-truth market state before calling Anthropic -------------
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://macrosignal.netlify.app";
    const mktResp = await fetch(`${base}/api/market?symbols=SPY,QQQ,^GSPC,^VIX,TLT,GLD,USO,HYG`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    const mkt = mktResp?.ok ? await mktResp.json() : {};
    const spyPrice = toNumber(mkt?.SPY?.price);
    const spyChangePct = toNumber(mkt?.SPY?.changePct);
    const qqqPrice = toNumber(mkt?.QQQ?.price);
    const qqqChangePct = toNumber(mkt?.QQQ?.changePct);
    const vixLevel = toNumber(mkt?.VIX?.price);
    const goldPrice = toNumber(mkt?.GLD?.price);
    const oilPrice = toNumber(mkt?.USO?.price);
    const impliedSp500 = spyPrice != null ? spyPrice * 10 : null;
    const f = (k) => mkt[k] ? `${mkt[k].price?.toFixed(2)} (${mkt[k].changePct >= 0 ? "+" : ""}${mkt[k].changePct?.toFixed(2)}%)` : "unavailable";

    // Movers strip data (deterministic from live market data — the UI renders this
    // as a colored ticker row so the prose doesn't have to recite every move).
    const movers = [
      ["SPY", mkt?.SPY?.changePct], ["QQQ", mkt?.QQQ?.changePct], ["S&P 500", mkt?.GSPC?.changePct],
      ["TLT", mkt?.TLT?.changePct], ["GLD", mkt?.GLD?.changePct], ["USO", mkt?.USO?.changePct], ["VIX", mkt?.VIX?.changePct],
    ].map(([label, cp]) => ({ label, changePct: toNumber(cp) })).filter((m) => m.changePct != null);

    let tenY = "unavailable";
    let tenYPct = null;
    try {
      const fredResp = await fetch(`${base}/api/fred?series_id=DGS10&limit=1&sort_order=desc`, {
        signal: AbortSignal.timeout(8000),
      });
      const fj = fredResp.ok ? await fredResp.json() : null;
      const v = fj?.observations?.[0]?.value;
      if (v && v !== ".") {
        tenYPct = toNumber(v);
        tenY = `${v}%`;
      }
    } catch {}

    // Fed funds effective rate (DFF, daily) — current level plus the 12-month
    // trend direction, so the LLM (and the stance guard below) know whether
    // the Fed is actually easing or tightening.
    let dffCurrent = null;
    let dffYearAgo = null;
    let dffTrendBps = null;
    try {
      const dffResp = await fetch(`${base}/api/fred?series_id=DFF&limit=366&sort_order=desc`, {
        signal: AbortSignal.timeout(8000),
      });
      const dj = dffResp.ok ? await dffResp.json() : null;
      const obs = Array.isArray(dj?.observations)
        ? dj.observations.filter((o) => o?.value && o.value !== ".")
        : [];
      if (obs.length > 0) {
        dffCurrent = toNumber(obs[0].value);
        dffYearAgo = toNumber(obs[obs.length - 1].value); // ~12 months back (daily series)
        if (dffCurrent != null && dffYearAgo != null) {
          dffTrendBps = Math.round((dffCurrent - dffYearAgo) * 100);
        }
      }
    } catch {}
    const dffEasing = dffTrendBps != null && dffTrendBps <= -25;
    const dffTightening = dffTrendBps != null && dffTrendBps >= 25;
    const dffTrendLabel = dffEasing ? "EASING (cutting)" : dffTightening ? "TIGHTENING (hiking)" : "ON HOLD";
    const fedFunds = dffCurrent != null
      ? `${dffCurrent.toFixed(2)}% (12 months ago: ${dffYearAgo?.toFixed(2)}%; 12m change: ${dffTrendBps >= 0 ? "+" : ""}${dffTrendBps}bps — Fed policy direction over the past year: ${dffTrendLabel})`
      : "unavailable";

    const groundTruthLookup = {
      "S&P 500": impliedSp500,
      SPY: spyPrice,
      QQQ: qqqPrice,
      VIX: vixLevel,
      "10Y": tenYPct,
      "Fed funds": dffCurrent,
      Gold: goldPrice,
      Oil: oilPrice,
    };

    const groundTruth = [
      `S&P 500 (^GSPC) = ${f("GSPC")}`,
      `SPY = ${f("SPY")}`,
      `QQQ = ${f("QQQ")}`,
      `VIX = ${f("VIX")}`,
      `10Y Treasury yield = ${tenY}`,
      `Fed funds effective rate (DFF) = ${fedFunds}`,
      `TLT (long bonds) = ${f("TLT")}`,
      `Gold (GLD) = ${f("GLD")}`,
      `WTI oil (USO) = ${f("USO")}`,
      `High-yield credit (HYG) = ${f("HYG")}`,
    ].join("\n");

    const perplexityBody = {
      model: PERPLEXITY_MODEL,
      messages: [
        {
          role: "system",
          content: "Include citations.",
        },
        {
          role: "user",
          content: `What are the most important news items driving US markets today (${todayIso()})? Provide detailed context for each development — what happened, who is affected, and why it matters for macro positioning. Cite all sources.`,
        },
      ],
      max_tokens: 800,
      search_recency_filter: "day",
      web_search_options: {
        search_context_size: "high",
      },
    };

    async function fetchPerplexity(payload) {
      const response = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        throw new Error(`Perplexity HTTP ${response.status}`);
      }
      return response.json();
    }

    let perplexityPayload;
    try {
      perplexityPayload = await fetchPerplexity(perplexityBody);
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }

    let rawOutput = perplexityPayload?.choices?.[0]?.message?.content?.trim() ?? "";
    const { citations, titleByUrl } = extractCitations(perplexityPayload);
    const preFilterCount = citations.length;
    const citationUrls = citations.filter(isAllowedFinancialSource);
    const filteredCount = preFilterCount - citationUrls.length;
    if (filteredCount > 0) {
      console.warn(`[narrative] filtered ${filteredCount}/${preFilterCount} non-financial citations`);
    }
    const fallbackSources = normalizeSources(citationUrls, titleByUrl);
    console.info(`[narrative] sources after filter: ${fallbackSources.length}`);
    if (fallbackSources.length === 0) {
      console.warn("[narrative] zero sources after filter");
    }
    if (rawOutput.length < 80) return res.status(502).json({ error: "paragraph too short" });

    // Build directional guard rule based on live SPY/QQQ change
    const bothDown = spyChangePct != null && qqqChangePct != null && spyChangePct < 0 && qqqChangePct < 0;
    const directionalRule = bothDown
      ? [
          "",
          "DIRECTIONAL RULE — MANDATORY:",
          `Today's session is a DECLINE: SPY ${spyChangePct >= 0 ? "+" : ""}${spyChangePct?.toFixed(2)}% and QQQ ${qqqChangePct >= 0 ? "+" : ""}${qqqChangePct?.toFixed(2)}%.`,
          "Because BOTH SPY and QQQ are negative on the day, you MUST describe the session as a pullback, decline, or selloff.",
          "You MUST NOT use any of the following words or phrases: rally, surge, surged, best day, broad gains, broadens rally, broad equity gains, broad-based gains.",
          "Violating this rule is a critical factual error.",
        ].join("\n")
      : "";

    // Fed policy rule based on the actual DFF 12-month trend: prevents
    // "hawkish Fed" / "rate hike" claims while the Fed is in an easing cycle
    // (and the symmetric error during a tightening cycle).
    const fedPolicyRule = dffEasing
      ? [
          "",
          "FED POLICY RULE — MANDATORY:",
          `The fed funds effective rate is ${dffCurrent.toFixed(2)}%, DOWN ${Math.abs(dffTrendBps)}bps over the past 12 months. The Fed is in an EASING cycle.`,
          "You MUST NOT describe the Fed as hawkish, tightening, hiking, or signaling rate hikes.",
          "If a news item claims the Fed is hawkish or planning hikes, omit that claim rather than repeating it.",
          "Violating this rule is a critical factual error.",
        ].join("\n")
      : dffTightening
        ? [
            "",
            "FED POLICY RULE — MANDATORY:",
            `The fed funds effective rate is ${dffCurrent.toFixed(2)}%, UP ${Math.abs(dffTrendBps)}bps over the past 12 months. The Fed is in a TIGHTENING cycle.`,
            "You MUST NOT describe the Fed as dovish, easing, cutting, or signaling rate cuts.",
            "If a news item claims the Fed is dovish or planning cuts, omit that claim rather than repeating it.",
            "Violating this rule is a critical factual error.",
          ].join("\n")
        : "";

    const anthropicSystem = [
      "You are a macro markets analyst for a Bloomberg-style terminal.",
      "Rewrite the provided news items into EXACTLY THREE short paragraphs separated by blank lines.",
      "Each paragraph should be 2-3 sentences and about 45 words.",
      "Use **bold** markdown ONLY for ticker symbols and numeric values.",
      "Do not use headings, bullets, italics, or other markdown.",
      "If you reference any of the instruments below, you MUST use the exact ground-truth value provided here and nothing else.",
      "If a ground-truth series is marked unavailable, omit it rather than guessing.",
      directionalRule,
      fedPolicyRule,
      "",
      "GROUND TRUTH — today's live US market state:",
      groundTruth,
      "",
      "A separate MOVERS data row already displays the exact ticker % changes (SPY, QQQ, S&P 500, TLT, GLD, USO, VIX). Do NOT recite individual ticker percentages in Paragraph 1 — describe the market narrative and drivers qualitatively (e.g. 'equities pulled back', 'duration outperformed', 'crude collapsed on the ceasefire').",
      "Paragraph structure:",
      "Paragraph 1: the market narrative and drivers (qualitative — no ticker % recitation; the movers row shows the numbers).",
      "Paragraph 2: policy and macro data.",
      "Paragraph 3: dominant catalyst and forward-looking positioning setup.",
      "",
      "The Perplexity text already contains inline citation markers like [1], [2]. You MUST preserve these markers exactly as-is in your rewrite. Do NOT convert them to [source N] or any other format. Do NOT add new markers or remove existing ones.",
    ].filter((line) => line !== undefined).join("\n");

    const anthropicUser = [
      `News items from Perplexity:\n${rawOutput}`,
      "",
      `Ground truth:\n${groundTruth}`,
      "",
      "Rewrite these into the required 3-paragraph briefing, using ONLY the ground-truth values for any SPY/QQQ/VIX/TLT/GLD/USO/HYG/10Y reference.",
      "",
      "Return a JSON object with EXACTLY these keys:",
      "{",
      '  "paragraph": "<3 paragraphs separated by blank lines, formatted per the rules above>",',
      '  "takeaway": "<single sentence 10-20 words describing the highest-conviction positioning implication for a macro investor today>"',
      "}",
      "Return ONLY the JSON object. No markdown fences, no commentary.",
    ].join("\n");

    try {
      let rewriteText = "";

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const anthropicResp = await fetch(ANTHROPIC_URL, {
            method: "POST",
            headers: {
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 700,
              system: anthropicSystem,
              messages: [{ role: "user", content: anthropicUser }],
            }),
            signal: AbortSignal.timeout(45000),
          });

          if (!anthropicResp.ok) {
            const error = new Error(`Anthropic HTTP ${anthropicResp.status}`);
            error.status = anthropicResp.status;
            error.body = await parseErrorBody(anthropicResp);
            throw error;
          }

          const anthropicPayload = await anthropicResp.json();
          rewriteText = anthropicPayload?.content?.[0]?.text?.trim?.() || "";
          break;
        } catch (error) {
          console.error(`[narrative] Haiku attempt ${attempt} failed:`, {
            status: error?.status ?? null,
            body: String(error?.body ?? error?.message ?? "").slice(0, 400) || null,
            attempt,
          });

          if (attempt === 2) {
            throw error;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const parsed = parseJsonObject(rewriteText);
      let paragraph = parsed?.paragraph ? String(parsed.paragraph).trim() : rewriteText;
      let takeaway = parsed?.takeaway ? String(parsed.takeaway).trim() : null;

      if (paragraph.length < 80) {
        throw new Error("Anthropic paragraph too short");
      }

      // Post-rewrite directional guard: if SPY and QQQ are both negative, strip
      // any bullish language that slipped through the LLM instruction.
      if (bothDown) {
        const guardedParagraph = stripBullishLanguage(paragraph);
        const guardedTakeaway = takeaway ? stripBullishLanguage(takeaway) : null;
        if (guardedParagraph.changed) {
          console.warn("[narrative] directional-guard stripped bullish language from paragraph", {
            spyChangePct,
            qqqChangePct,
          });
          paragraph = guardedParagraph.text;
        }
        if (guardedTakeaway?.changed) {
          console.warn("[narrative] directional-guard stripped bullish language from takeaway", {
            spyChangePct,
            qqqChangePct,
          });
          takeaway = guardedTakeaway.text;
        }
      }

      // Fed-stance guard: if DFF has fallen over the past 12 months, strip any
      // hawkish/tightening framing that slipped through the LLM instruction.
      if (dffEasing) {
        const guardedParagraph = stripHawkishLanguage(paragraph);
        const guardedTakeaway = takeaway ? stripHawkishLanguage(takeaway) : null;
        if (guardedParagraph.changed) {
          console.warn("[narrative] fed-stance guard stripped hawkish language from paragraph", {
            dffCurrent,
            dffTrendBps,
          });
          paragraph = guardedParagraph.text;
        }
        if (guardedTakeaway?.changed) {
          console.warn("[narrative] fed-stance guard stripped hawkish language from takeaway", {
            dffCurrent,
            dffTrendBps,
          });
          takeaway = guardedTakeaway.text;
        }
      }

      const fetchedAt = new Date().toISOString();
      const sanitizedParagraph = sanitizeParagraph(paragraph, groundTruthLookup);
      const sanitizedTakeaway = takeaway ? sanitizeParagraph(takeaway, groundTruthLookup) : null;
      const body = {
        paragraph: sanitizedParagraph.text,
        takeaway: sanitizedTakeaway?.text ?? null,
        movers,
        sources: fallbackSources,
        fetchedAt,
        model: FINAL_MODEL,
        sanitizedReplacements: sanitizedParagraph.replacements + (sanitizedTakeaway?.replacements ?? 0),
      };

      await putJSON("overview/narrative.json", body);

      return res.status(200).json({
        ok: true,
        paragraph: `${sanitizedParagraph.text.slice(0, 100)}...`,
        sources: body.sources.length,
        fetchedAt,
        model: FINAL_MODEL,
        sanitizedReplacements: body.sanitizedReplacements,
      });
    } catch (anthropicErr) {
      console.error(anthropicErr?.message ?? anthropicErr);

      const fetchedAt = new Date().toISOString();
      // The raw Perplexity text is exactly where hawkish-while-easing claims
      // originate, so the fed-stance guard applies to the fallback path too.
      let fallbackParagraph = rawOutput;
      if (dffEasing) {
        const guarded = stripHawkishLanguage(fallbackParagraph);
        if (guarded.changed) {
          console.warn("[narrative] fed-stance guard stripped hawkish language from fallback paragraph", {
            dffCurrent,
            dffTrendBps,
          });
          fallbackParagraph = guarded.text;
        }
      }
      const sanitized = sanitizeParagraph(fallbackParagraph, groundTruthLookup);
      const body = {
        paragraph: sanitized.text,
        takeaway: null,
        movers,
        sources: fallbackSources,
        fetchedAt,
        model: FALLBACK_MODEL,
        sanitizedReplacements: sanitized.replacements,
      };

      await putJSON("overview/narrative.json", body);

      return res.status(200).json({
        ok: true,
        warning: "anthropic_rewrite_failed",
        paragraph: `${sanitized.text.slice(0, 100)}...`,
        sources: body.sources.length,
        fetchedAt,
        model: FALLBACK_MODEL,
        sanitizedReplacements: sanitized.replacements,
      });
    }
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
