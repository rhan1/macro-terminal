export default async function handler(req, res) {
  try {
    const url = "https://tradingeconomics.com/united-states/consumer-confidence";
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroTerminal/1.0)" },
    });
    if (!resp.ok) throw new Error(`Trading Economics: ${resp.status}`);
    const html = await resp.text();

    // Extract CB Consumer Confidence value — matches patterns like
    // "increased to X from Y in Month of Year" or "decreased to X from Y in Month of Year"
    const match = html.match(
      /(?:increased|decreased|changed) to ([\d.]+).*?from ([\d.]+).*?in (\w+ of \d{4})/
    );

    const result = {
      value: match ? parseFloat(match[1]) : null,
      prior: match ? parseFloat(match[2]) : null,
      period: match ? match[3] : null,
    };

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ value: null, prior: null, period: null });
  }
}
