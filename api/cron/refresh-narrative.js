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
    const f = (k) => mkt[k] ? `${mkt[k].price?.toFixed(2)} (${mkt[k].changePct >= 0 ? "+" : ""}${mkt[k].changePct?.toFixed(2)}%)` : "unavailable";

    let tenY = "unavailable";
    try {
      const fredResp = await fetch(`${base}/api/fred?series_id=DGS10&limit=1&sort_order=desc`, {
        signal: AbortSignal.timeout(8000),
      });
      const fj = fredResp.ok ? await fredResp.json() : null;
      const v = fj?.observations?.[0]?.value;
      if (v && v !== ".") tenY = `${v}%`;
    } catch {}

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
            content: [
              "List the top 3-5 US macro news items driving markets today.",
              "For each item, give a one-sentence summary and include a citation URL.",
              "Keep the response concise and factual.",
            ].join(" "),
          },
          {
            role: "user",
            content: `What are the top US macro news items driving markets on ${todayIso()}?`,
          },
        ],
        max_tokens: 350,
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
      "Paragraph 3: dominant catalyst and a one-sentence forward-looking takeaway.",
      "",
      "Preserve the citation URLs from Perplexity as inline [source N] references in the paragraph text.",
      "Return ONLY valid JSON with this shape: {\"paragraph\":\"...\",\"sources\":[{\"url\":\"https://...\",\"title\":null}]}",
      "The sources array must list the cited URLs in [source N] order with title set to null.",
    ].join("\n");

    const anthropicUser = [
      `News items from Perplexity:\n${rawOutput}`,
      "",
      `Perplexity citation URLs:\n${citationUrls.map((url, idx) => `[source ${idx + 1}] ${url}`).join("\n") || "None provided."}`,
      "",
      `Ground truth:\n${groundTruth}`,
      "",
      "Rewrite these into the required 3-paragraph briefing, using ONLY the ground-truth values for any SPY/QQQ/VIX/TLT/GLD/USO/HYG/10Y reference. Preserve the citation URLs from Perplexity in the text as [source N] references and return the citations list separately.",
    ].join("\n");

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
          max_tokens: 500,
          system: anthropicSystem,
          messages: [{ role: "user", content: anthropicUser }],
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (!anthropicResp.ok) {
        throw new Error(`Anthropic HTTP ${anthropicResp.status}`);
      }

      const anthropicPayload = await anthropicResp.json();
      const rewriteText = anthropicPayload?.content?.[0]?.text?.trim?.() || "";
      const parsed = parseJsonObject(rewriteText);
      const paragraph = parsed?.paragraph ? String(parsed.paragraph).trim() : "";
      const sources = normalizeSources((parsed?.sources || []).map((item) => item?.url).filter(Boolean));

      if (paragraph.length < 80) {
        throw new Error("Anthropic paragraph too short");
      }

      const fetchedAt = new Date().toISOString();
      const body = {
        paragraph,
        sources: sources.length ? sources : fallbackSources,
        fetchedAt,
        model: FINAL_MODEL,
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
        paragraph: `${paragraph.slice(0, 100)}...`,
        sources: body.sources.length,
        fetchedAt,
        model: FINAL_MODEL,
      });
    } catch (anthropicErr) {
      console.error(anthropicErr?.message ?? anthropicErr);

      const fetchedAt = new Date().toISOString();
      const body = {
        paragraph: rawOutput,
        sources: fallbackSources,
        fetchedAt,
        model: FALLBACK_MODEL,
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
        paragraph: `${rawOutput.slice(0, 100)}...`,
        sources: body.sources.length,
        fetchedAt,
        model: FALLBACK_MODEL,
      });
    }
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
