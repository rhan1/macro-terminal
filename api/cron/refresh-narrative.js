// Refreshes the Blob-backed market drivers overview by fetching cited macro
// news from Perplexity Sonar Pro, then rewriting it with Anthropic using
// ground-truth market values before overwriting overview/narrative.json.
// Requires PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN, and CRON_SECRET.
// Manual invoke:
// curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/refresh-narrative

import { put } from "@vercel/blob";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PERPLEXITY_MODEL = "sonar-pro";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const FINAL_MODEL = "sonar-pro+claude-haiku-4-5";
const FALLBACK_MODEL = "sonar-pro-fallback";
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
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!perplexityKey) return res.status(500).json({ error: "PERPLEXITY_API_KEY not configured" });
    if (!anthropicKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not configured" });

    // --- Fetch ground-truth market state before calling Anthropic -------------
    const base = `https://${process.env.VERCEL_URL || "macro-terminal-bice.vercel.app"}`;
    const mktResp = await fetch(`${base}/api/market?symbols=SPY,QQQ,^GSPC,^VIX,TLT,GLD,USO,HYG`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    const mkt = mktResp?.ok ? await mktResp.json() : {};
    const spyPrice = toNumber(mkt?.SPY?.price);
    const qqqPrice = toNumber(mkt?.QQQ?.price);
    const vixLevel = toNumber(mkt?.VIX?.price);
    const goldPrice = toNumber(mkt?.GLD?.price);
    const oilPrice = toNumber(mkt?.USO?.price);
    const impliedSp500 = spyPrice != null ? spyPrice * 10 : null;
    const f = (k) => mkt[k] ? `${mkt[k].price?.toFixed(2)} (${mkt[k].changePct >= 0 ? "+" : ""}${mkt[k].changePct?.toFixed(2)}%)` : "unavailable";

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

    const perplexityResp = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: "system",
            content: "Include citations.",
          },
          {
            role: "user",
            content: `List exactly 6 of the most important, concrete news items driving US equity, rates, and macro positioning decisions today (${todayIso()}). For each: one sentence of what happened, one sentence of WHY it matters for a macro investor's positioning.

Cite from mainstream financial news (Bloomberg, Reuters, WSJ, FT, CNBC, MarketWatch, Barron's) or primary/official sources (Federal Reserve, Treasury, SEC, IMF, BLS, BEA). Do NOT cite YouTube, Twitter/X, blogs, Reddit, or forums.

No generic summaries, no platitudes. Just facts and their positioning implications.`,
          },
        ],
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!perplexityResp.ok) {
      return res.status(502).json({ error: `Perplexity HTTP ${perplexityResp.status}` });
    }

    const perplexityPayload = await perplexityResp.json();
    const rawOutput = perplexityPayload?.choices?.[0]?.message?.content?.trim() ?? "";
    const citationUrls = Array.isArray(perplexityPayload?.citations) ? perplexityPayload.citations : [];
    const fallbackSources = normalizeSources(citationUrls);
    if (rawOutput.length < 80) return res.status(502).json({ error: "paragraph too short" });

    const anthropicSystem = [
      "You are a macro markets analyst for a Bloomberg-style terminal.",
      "Rewrite the provided news items into EXACTLY THREE short paragraphs separated by blank lines.",
      "Each paragraph should be 2-3 sentences and about 45 words.",
      "Use **bold** markdown ONLY for ticker symbols and numeric values.",
      "Do not use headings, bullets, italics, or other markdown.",
      "If you reference any of the instruments below, you MUST use the exact ground-truth value provided here and nothing else.",
      "If a ground-truth series is marked unavailable, omit it rather than guessing.",
      "",
      "GROUND TRUTH — today's live US market state:",
      groundTruth,
      "",
      "Paragraph structure:",
      "Paragraph 1: market state and main movers.",
      "Paragraph 2: policy and macro data.",
      "Paragraph 3: dominant catalyst and forward-looking positioning setup.",
      "",
      "The Perplexity text already contains inline citation markers like [1], [2]. You MUST preserve these markers exactly as-is in your rewrite. Do NOT convert them to [source N] or any other format. Do NOT add new markers or remove existing ones.",
    ].join("\n");

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
      const paragraph = parsed?.paragraph ? String(parsed.paragraph).trim() : rewriteText;
      const takeaway = parsed?.takeaway ? String(parsed.takeaway).trim() : null;

      if (paragraph.length < 80) {
        throw new Error("Anthropic paragraph too short");
      }

      const fetchedAt = new Date().toISOString();
      const sanitizedParagraph = sanitizeParagraph(paragraph, groundTruthLookup);
      const sanitizedTakeaway = takeaway ? sanitizeParagraph(takeaway, groundTruthLookup) : null;
      const body = {
        paragraph: sanitizedParagraph.text,
        takeaway: sanitizedTakeaway?.text ?? null,
        sources: fallbackSources,
        fetchedAt,
        model: FINAL_MODEL,
        sanitizedReplacements: sanitizedParagraph.replacements + (sanitizedTakeaway?.replacements ?? 0),
      };

      await put("overview/narrative.json", JSON.stringify(body), {
        access: "private",
        contentType: "application/json",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });

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
        sources: fallbackSources,
        fetchedAt,
        model: FALLBACK_MODEL,
        sanitizedReplacements: sanitized.replacements,
      };

      await put("overview/narrative.json", JSON.stringify(body), {
        access: "private",
        contentType: "application/json",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });

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
