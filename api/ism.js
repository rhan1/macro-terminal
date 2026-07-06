export default async function handler(req, res) {
  try {
    // NOTE (verified 2026-07-04): this URL slug looks wrong (reads "business
    // confidence") but IS the correct ISM Manufacturing PMI page — Trading
    // Economics kept the legacy "business-confidence" slug when it remapped
    // this indicator to ISM Mfg PMI. Confirmed via: (1) the page's own <h1>
    // reads "United States ISM Manufacturing PMI"; (2) its historical range
    // (1948–present, all-time high 77.5 in Jul 1950) matches the well-known
    // ISM/NAPM series exactly; (3) the live scraped value (53.3 Jun / 54.0
    // May 2026) matches ISM's official PR Newswire release to the decimal.
    // Do NOT swap to /united-states/ism-purchasing-managers-index — that
    // slug doesn't exist on TE (soft-404: generic homepage shell, no data).
    // Do NOT swap to /united-states/manufacturing-pmi either — that's a
    // *different* composite (S&P Global/Markit Mfg PMI, history starts 2012).
    const url = "https://tradingeconomics.com/united-states/business-confidence";
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroTerminal/1.0)" },
    });
    if (!resp.ok) throw new Error(`Trading Economics: ${resp.status}`);
    const html = await resp.text();

    // Extract ISM Manufacturing PMI from the page description.
    // Trading Economics phrases it as: "increased to 54 points in May from 52.70
    // points in April of 2026". The current month has no year suffix; derive it
    // from the prior period's year.
    const mfgMatch = html.match(
      /(?:increased|decreased|changed) to ([\d.]+) points in (\w+) from ([\d.]+) points in (\w+ of \d{4})/i
    );

    function buildPeriod(currentMonth, priorPeriodStr) {
      const year = priorPeriodStr?.match(/\d{4}/)?.[0];
      return year ? `${currentMonth} of ${year}` : currentMonth;
    }

    const result = {
      manufacturing: {
        value: mfgMatch ? parseFloat(mfgMatch[1]) : null,
        prior: mfgMatch ? parseFloat(mfgMatch[3]) : null,
        period: mfgMatch ? buildPeriod(mfgMatch[2], mfgMatch[4]) : null,
      },
    };

    // Try to get ISM Services too
    try {
      const svcResp = await fetch(
        "https://tradingeconomics.com/united-states/non-manufacturing-pmi",
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroTerminal/1.0)" } }
      );
      if (svcResp.ok) {
        const svcHtml = await svcResp.text();
        const svcMatch = svcHtml.match(
          /(?:increased|decreased|changed) to ([\d.]+) points in (\w+) from ([\d.]+) points in (\w+ of \d{4})/i
        );
        if (svcMatch) {
          result.services = {
            value: parseFloat(svcMatch[1]),
            prior: parseFloat(svcMatch[3]),
            period: buildPeriod(svcMatch[2], svcMatch[4]),
          };
        }
      }
    } catch (_) {}

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
