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
            content: [
              "You are a macro markets analyst for a Bloomberg-style terminal.",
              "Write a market briefing in EXACTLY THREE short paragraphs, separated by blank lines.",
              "Each paragraph 2–3 sentences (~45 words). Total ~140 words.",
              "",
              "Use **bold** markdown ONLY for ticker symbols (e.g. **NVDA**) and key numeric data points (e.g. **4.28%**, **$152M**, **+1.4%**). Do not use headers, lists, italics, or any other markdown.",
              "",
              "Paragraph 1 — Market state and movers: overall US market direction right now, and the most-moved sectors and individual tickers with specific moves.",
              "Paragraph 2 — Policy and data: Fed policy expectations plus the latest macro data release (CPI, PPI, NFP, PCE, GDP, or FOMC) with specific numbers.",
              "Paragraph 3 — Catalyst and outlook: the dominant geopolitical or earnings catalyst, then a one-sentence forward-looking takeaway.",
              "",
              "Be specific. Skip platitudes. Prose only.",
            ].join("\n"),
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
