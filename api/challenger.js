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

    // Period extraction — derive year from the article's publish date (JSON-LD
    // or Open Graph), NOT from the first 4-digit year in the body text, which
    // often grabs a historical reference like "since 2020".
    const publishedMatch = articleHtml.match(
      /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/
    ) || articleHtml.match(
      /property="article:published_time"\s+content="(\d{4}-\d{2}-\d{2})/
    ) || articleHtml.match(
      /content="(\d{4}-\d{2}-\d{2})[^"]*"\s+(?:name|property)="article:published_time"/
    );
    const year = publishedMatch
      ? publishedMatch[1].slice(0, 4)
      : new Date().getFullYear();
    result.period = `${month} ${year}`;

    // Comparison data (Optional)
    // Example: "up 16% from the 83,387 job cuts recorded in April"
    // The verb alternates between "announced" and "recorded" depending on the month.
    const priorMatch = cleanText.match(
      /(up|down) (\d+)% from (?:the )?([\d,]+) (?:job cuts|cuts) (?:announced|recorded) in (\w+)/
    );
    if (priorMatch) {
      result.direction = priorMatch[1];
      result.pctChange = parseInt(priorMatch[2], 10);
      result.prior = parseInt(priorMatch[3].replace(/,/g, ""), 10);
      result.priorPeriod = priorMatch[4];
    }

    // YTD extraction (Optional)
    // The article uses "So far this year, employers have announced X cuts" rather
    // than "first quarter / year-to-date" phrasing.
    const ytdMatch = cleanText.match(
      /(?:So far this year[^,]*,?\s*employers have announced ([\d,]+) cuts|(?:first quarter|first half|year[- ]to[- ]date|YTD)[^.]*?([\d,]+) (?:job cuts|cuts))/i
    );
    if (ytdMatch) {
      result.ytd = parseInt((ytdMatch[1] || ytdMatch[2]).replace(/,/g, ""), 10);
    }

    // Top Reason extraction (Optional)
    // Examples:
    //   "Artificial Intelligence (AI) led all reasons for job cuts, with 15,341"
    //   "Market Conditions led all reasons, with 8,200"
    //   "Cost Cutting was the top reason for job cuts, with 5,000"
    //   "Restructuring cited X as the primary driver of job cuts, with 3,100"
    const reasonMatch = cleanText.match(
      /([A-Z][A-Za-z ()\/&-]+?)\s+(?:led all reasons(?:\s+for job cuts)?|was the top reason(?:\s+for job cuts)?|cited\s+\S+\s+as the primary driver(?:\s+of job cuts)?),?\s+with\s+([\d,]+)/
    );
    if (reasonMatch) {
      result.topReason = {
        name: reasonMatch[1].trim(),
        count: parseInt(reasonMatch[2].replace(/,/g, ""), 10),
      };
    } else {
      console.warn("[challenger] topReason regex produced no match — article text may have changed phrasing");
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
