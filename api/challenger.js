// Scrapes Challenger, Gray & Christmas's monthly job-cut report.
// Provides data on US employer-announced job cuts and reasons.
// Data is typically released on the first Thursday of every month.

const INDEX_URL = "https://www.challengergray.com/blog/category/job-cuts-report/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ").trim());
}

export default async function handler(req, res) {
  const result = {
    headline: null,
    period: null,
    prior: null,
    priorPeriod: null,
    pctChange: null,
    direction: null,
    ytd: null,
    topReason: null,
    articleUrl: null,
    articleTitle: null,
    source: "Challenger, Gray & Christmas",
  };

  try {
    const indexResp = await fetch(INDEX_URL, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });

    if (!indexResp.ok) {
      return res.status(200).json({
        ...result,
        error: `Upstream HTTP ${indexResp.status}`,
      });
    }

    const indexHtml = await indexResp.text();
    const articleMatch = indexHtml.match(
      /<a[^>]+href="(https:\/\/www\.challengergray\.com\/blog\/challenger-report-[^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );

    if (!articleMatch) {
      return res.status(200).json({
        ...result,
        error: "Article link not found",
      });
    }

    result.articleUrl = articleMatch[1];
    result.articleTitle = stripTags(articleMatch[2]);

    const articleResp = await fetch(result.articleUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });

    if (!articleResp.ok) {
      return res.status(200).json({
        ...result,
        error: `Upstream HTTP ${articleResp.status}`,
      });
    }

    const articleHtml = await articleResp.text();

    // Prefer <title> from the article page — the index-page anchor often
    // wraps an image and yields empty text after stripTags.
    const pageTitleMatch = articleHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (pageTitleMatch) {
      const pageTitle = decodeEntities(pageTitleMatch[1])
        .replace(/\s*[|·–—-]\s*Challenger.*$/i, "")
        .trim();
      if (pageTitle) result.articleTitle = pageTitle;
    }

    const cleanText = stripTags(articleHtml).replace(/\s+/g, " ");

    // Headline extraction (Required for success path)
    // Example: "U.S.-based employers announced 60,620 job cuts in March"
    const headlineMatch = cleanText.match(
      /U\.S\.-based employers announced ([\d,]+) job cuts in (\w+)/
    );

    if (!headlineMatch) {
      return res.status(200).json({
        ...result,
        error: "Regex miss on HEADLINE field",
      });
    }

    result.headline = parseInt(headlineMatch[1].replace(/,/g, ""), 10);
    const month = headlineMatch[2];

    // Period extraction (Infer year from body text or fallback to current year)
    const yearMatch = cleanText.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
    result.period = `${month} ${year}`;

    // Comparison data (Optional)
    // Example: "up 25% from 48,307 cuts announced in February"
    const priorMatch = cleanText.match(
      /(up|down) (\d+)% from ([\d,]+) cuts announced in (\w+)/
    );
    if (priorMatch) {
      result.direction = priorMatch[1];
      result.pctChange = parseInt(priorMatch[2], 10);
      result.prior = parseInt(priorMatch[3].replace(/,/g, ""), 10);
      result.priorPeriod = priorMatch[4];
    }

    // YTD extraction (Optional)
    const ytdMatch = cleanText.match(
      /(?:first quarter|first half|year[- ]to[- ]date|YTD)[^.]*?([\d,]+) (?:job cuts|cuts)/i
    );
    if (ytdMatch) {
      result.ytd = parseInt(ytdMatch[1].replace(/,/g, ""), 10);
    }

    // Top Reason extraction (Optional)
    // Example: "Artificial Intelligence (AI) led all reasons for job cuts, with 15,341"
    const reasonMatch = cleanText.match(
      /([A-Z][A-Za-z ()\/&-]+?) led all reasons for job cuts,? with ([\d,]+)/
    );
    if (reasonMatch) {
      result.topReason = {
        name: reasonMatch[1].trim(),
        count: parseInt(reasonMatch[2].replace(/,/g, ""), 10),
      };
    }

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    return res.status(200).json({
      ...result,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      ...result,
      error: err?.message || "Unknown error",
    });
  }
}
