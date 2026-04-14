export default async function handler(req, res) {
  try {
    const url = "https://tradingeconomics.com/united-states/business-confidence";
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroTerminal/1.0)" },
    });
    if (!resp.ok) throw new Error(`Trading Economics: ${resp.status}`);
    const html = await resp.text();

    // Extract ISM Manufacturing PMI from JSON-LD structured data
    const mfgMatch = html.match(
      /increased to ([\d.]+).*?from ([\d.]+).*?in (\w+ of \d{4})/
    );

    const result = {
      manufacturing: {
        value: mfgMatch ? parseFloat(mfgMatch[1]) : null,
        prior: mfgMatch ? parseFloat(mfgMatch[2]) : null,
        period: mfgMatch ? mfgMatch[3] : null,
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
          /(?:increased|decreased|changed) to ([\d.]+).*?from ([\d.]+).*?in (\w+ of \d{4})/
        );
        if (svcMatch) {
          result.services = {
            value: parseFloat(svcMatch[1]),
            prior: parseFloat(svcMatch[2]),
            period: svcMatch[3],
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
