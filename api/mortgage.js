// Scrapes https://www.mortgagenewsdaily.com/mortgage-rates/30-year-fixed
// Returns current 30yr rate, daily change, header rates (15yr), and survey history
// from MND (daily), MBA (weekly), and Freddie Mac (weekly).

export default async function handler(req, res) {
  try {
    const url =
      "https://www.mortgagenewsdaily.com/mortgage-rates/30-year-fixed";
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!resp.ok) {
      return res
        .status(200)
        .json({ error: `Upstream responded ${resp.status}` });
    }

    const html = await resp.text();

    // ── 1. Last-updated timestamp from og:last_updated meta tag ────────────
    const lastUpdatedMatch = html.match(
      /<meta property="og:last_updated" content="([^"]+)"/
    );
    const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1] : null;

    // ── 2. Header charts: 30YR, 15YR (and MBS/treasury as bonus context) ──
    // Each block: <div class="header-chart"> ... <div class="product">NAME</div>
    //   <div class="price">RATE</div>  <div class="rate rate-up|rate-down">CHANGE</div>
    const headerRates = {};
    const headerChartRe =
      /<div class="product">([^<]+)<\/div>\s*<div class="price">([^<]+)<\/div>\s*<div class="rate[^"]*">([^<]+)<\/div>/g;
    let hm;
    while ((hm = headerChartRe.exec(html)) !== null) {
      const product = hm[1].trim();
      const price = hm[2].trim();
      const change = decodeHTMLEntities(hm[3].trim());

      // Map to clean keys
      if (product === "30YR Fixed Rate") {
        headerRates["30yr"] = { product, rate: price, change };
      } else if (product === "15YR Fixed Rate") {
        headerRates["15yr"] = { product, rate: price, change };
      } else if (product === "UMBS 30YR 5.0") {
        headerRates["umbs30"] = { product, price, change };
      } else if (product === "10 Year Treasury") {
        headerRates["treasury10yr"] = { product, price, change };
      }
    }

    // ── 3. Rates table: three survey sources, each with ~3-6 data rows ─────
    // Structure: <th class="rate-product">SURVEY NAME</th>
    //   then <tr> rows with: date (hidden-xs span), rate td, points td,
    //                        change td, priorYear rate td, yoyChange td
    const surveys = {};

    const tableMatch = html.match(
      /<table class="table table-hover mtg-rates">([\s\S]*?)<\/table>/
    );
    if (tableMatch) {
      const tableHTML = tableMatch[1];

      // Split table by product headers to get per-survey sections
      const sectionRe =
        /<th colspan="6" class="rate-product">([\s\S]*?)<\/th>([\s\S]*?)(?=<th colspan="6" class="rate-product">|$)/g;
      let sm;
      while ((sm = sectionRe.exec(tableHTML)) !== null) {
        const surveyName = sm[1].trim();
        const sectionHTML = sm[2];

        const rows = [];
        const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
        let rm;
        while ((rm = rowRe.exec(sectionHTML)) !== null) {
          const row = rm[1];

          // Date: prefer the hidden-xs (long) span
          const dateMatch = row.match(
            /<span class="hidden-xs">([^<]+)<\/span>/
          );
          if (!dateMatch) continue; // skip rows without a date (thead, spacers)

          const date = dateMatch[1].trim();

          // All <td class="rate"> values — first is current rate, second is prior year
          const rateMatches = [...row.matchAll(/<td class="rate">([^<]+)<\/td>/g)];
          const rate = rateMatches[0] ? rateMatches[0][1].trim() : null;
          const priorYear = rateMatches[1] ? rateMatches[1][1].trim() : null;

          // Points (second td, no special class)
          const pointsMatch = row.match(/<td>([^<]+)<\/td>/);
          const points = pointsMatch ? pointsMatch[1].trim() : null;

          // Daily change
          const changeMatch = row.match(
            /<td class="text-center change">\s*([\s\S]*?)<i /
          );
          const change = changeMatch
            ? decodeHTMLEntities(changeMatch[1].trim())
            : null;

          // YOY change (second change td)
          const changeTds = [
            ...row.matchAll(
              /<td class="text-center change">\s*([\s\S]*?)<i /g
            ),
          ];
          const yoyChange =
            changeTds.length > 1
              ? decodeHTMLEntities(changeTds[1][1].trim())
              : null;

          // Direction from icon class
          const directionMatch = row.match(/fa-arrow-(up|down)|fa-minus/);
          const direction = directionMatch
            ? directionMatch[1] === "up"
              ? "up"
              : directionMatch[1] === "down"
              ? "down"
              : "unchanged"
            : null;

          rows.push({ date, rate, points, change, direction, priorYear, yoyChange });
        }

        if (rows.length > 0) {
          surveys[surveyName] = rows;
        }
      }
    }

    // ── 4. Build clean top-level current values ───────────────────────────
    const mndRows = surveys["MND's 30 Year Fixed (daily survey)"] || [];
    const current30yr = mndRows[0] || null;

    const result = {
      lastUpdated,
      current: {
        rate: headerRates["30yr"]?.rate ?? current30yr?.rate ?? null,
        change: headerRates["30yr"]?.change ?? current30yr?.change ?? null,
        direction: current30yr?.direction ?? null,
        asOf: current30yr?.date ?? null,
      },
      rates: headerRates,
      surveys,
    };

    res.setHeader(
      "Cache-Control",
      "s-maxage=1800, stale-while-revalidate=3600"
    );
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}

// Decode the handful of HTML entities MND uses in rate strings
function decodeHTMLEntities(str) {
  return str
    .replace(/&#x2B;/g, "+")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}
