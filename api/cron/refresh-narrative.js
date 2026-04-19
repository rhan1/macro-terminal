// Refreshes the Blob-backed one-paragraph "today's market drivers" overview
// by calling Perplexity Sonar Pro, extracting the paragraph plus citations,
// and overwriting overview/narrative.json in private Vercel Blob storage.
// Requires PERPLEXITY_API_KEY, BLOB_READ_WRITE_TOKEN, and CRON_SECRET.
// Manual invoke:
// curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/refresh-narrative

import { put } from "@vercel/blob";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!apiKey) return res.status(500).json({ error: "PERPLEXITY_API_KEY not configured" });
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not configured" });

    // --- Fetch ground-truth market state before calling Perplexity -------------
    const base = `https://${process.env.VERCEL_URL || "macro-terminal-bice.vercel.app"}`;
    const mktResp = await fetch(`${base}/api/market?symbols=SPY,QQQ,^GSPC,^VIX,TLT,GLD,USO,HYG`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    const mkt = mktResp?.ok ? await mktResp.json() : {};
    const f = (k) => mkt[k] ? `${mkt[k].price?.toFixed(2)} (${mkt[k].changePct >= 0 ? "+" : ""}${mkt[k].changePct?.toFixed(2)}%)` : "unavailable";

    let tenY = "unavailable";
    try {
      const fredResp = await fetch(`${base}/api/fred?series_id=DGS10&limit=1&sort_order=desc`, { signal: AbortSignal.timeout(8000) });
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

    const systemPrompt = [
      "You are a macro markets analyst for a Bloomberg-style terminal.",
      "Write a market briefing in EXACTLY THREE short paragraphs, separated by blank lines.",
      "Each paragraph 2–3 sentences (~45 words). Total ~140 words.",
      "",
      "GROUND TRUTH — today's live US market state (use these EXACT values for any reference to these instruments):",
      groundTruth,
      "",
      "HARD RULES — violations disqualify the response:",
      "1. If you reference a price, index level, yield, or percent move for any instrument listed above, it MUST match the ground-truth value character-for-character. Do NOT round, restate, or paraphrase differently.",
      "2. If you reference any OTHER numeric value (individual ticker move, macro data release, earnings beat, rate-cut probability, CPI print, etc.), it MUST come from a cited news source. Do NOT invent thresholds, round numbers, or 'record high' levels.",
      "3. Never claim a level was 'breached', 'hit a record', or 'crossed a threshold' unless the ground-truth value above supports it. The S&P 500 did NOT cross 7,150 if ground truth shows 7,126.",
      "4. If live market data is 'unavailable' for a series, simply omit that instrument — do not guess.",
      "",
      "Use **bold** markdown ONLY for ticker symbols (e.g. **NVDA**) and numeric data points (e.g. **4.28%**, **$152M**, **+1.4%**). No headers, lists, italics, or other markdown.",
      "",
      "Paragraph 1 — Market state and movers: use the ground-truth values above for index/SPY/VIX context; then cite individual ticker movers from news sources.",
      "Paragraph 2 — Policy and data: Fed policy expectations plus the latest macro data release (CPI, PPI, NFP, PCE, GDP, or FOMC) with cited numbers.",
      "Paragraph 3 — Catalyst and outlook: dominant geopolitical or earnings catalyst, then a one-sentence forward-looking takeaway.",
      "",
      "Be specific. Skip platitudes. Prose only.",
    ].join("\n");

    const perplexityResp = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `What is driving US markets as of ${todayIso()}?`,
          },
        ],
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!perplexityResp.ok) {
      return res.status(502).json({ error: `Perplexity HTTP ${perplexityResp.status}` });
    }

    const payload = await perplexityResp.json();
    const paragraph = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    const citations = Array.isArray(payload?.citations) ? payload.citations : [];
    if (paragraph.length < 200) return res.status(502).json({ error: "paragraph too short" });

    const fetchedAt = new Date().toISOString();
    const body = {
      paragraph,
      sources: citations.map((url) => ({ url, title: null })),
      fetchedAt,
      model: MODEL,
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
      model: MODEL,
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
}
