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
const DISALLOWED_CITATION_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "reddit.com",
  "www.reddit.com",
  "tiktok.com",
  "www.tiktok.com",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
]);
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

function normalizeSources(urls) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter(Boolean).map((url) => String(url).trim()))]
    .map((url) => ({ url, title: null }));
}

function isDisallowedCitationUrl(url) {
  try {
    return DISALLOWED_CITATION_HOSTNAMES.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
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

    const groundTruthLookup = {
      "S&P 500": impliedSp500,
      SPY: spyPrice,
      QQQ: qqqPrice,
      VIX: vixLevel,
      "10Y": tenYPct,
      Gold: goldPrice,
      Oil: oilPrice,
    };

    const groundTruth = [
      `S&P 500 (^GSPC) = ${f("GSPC")}`,
      `SPY = ${f("SPY")}`,
      `QQQ = ${f("QQQ")}`,
      `VIX = ${f("VIX")}`,
      `10Y Treasury yield = ${tenY}`,
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
    let citationUrls = Array.isArray(perplexityPayload?.citations) ? perplexityPayload.citations : [];
    const preFilterCount = citationUrls.length;
    citationUrls = citationUrls.filter((url) => !isDisallowedCitationUrl(url));
    const filteredCount = preFilterCount - citationUrls.length;
    if (filteredCount > 0) {
      console.warn(`[narrative] filtered ${filteredCount} disallowed-domain citations`);
    }
    const fallbackSources = normalizeSources(citationUrls);
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

    const anthropicSystem = [
      "You are a macro markets analyst for a Bloomberg-style terminal.",
      "Rewrite the provided news items into EXACTLY THREE short paragraphs separated by blank lines.",
      "Each paragraph should be 2-3 sentences and about 45 words.",
      "Use **bold** markdown ONLY for ticker symbols and numeric values.",
      "Do not use headings, bullets, italics, or other markdown.",
      "If you reference any of the instruments below, you MUST use the exact ground-truth value provided here and nothing else.",
      "If a ground-truth series is marked unavailable, omit it rather than guessing.",
      directionalRule,
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
      const sanitized = sanitizeParagraph(rawOutput, groundTruthLookup);
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
