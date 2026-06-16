export default async function handler(req, res) {
  try {
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
