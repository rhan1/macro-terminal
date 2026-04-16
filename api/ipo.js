export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");

  try {
    const url = "https://www.iposcoop.com/ipo-calendar/";
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!resp.ok) {
      return res
        .status(200)
        .json({ error: `Upstream HTTP ${resp.status}`, ipos: [] });
    }

    const html = await resp.text();

    const stripTags = (s) => s.replace(/<[^>]+>/g, "").trim();
    const parseFloat2 = (s) => {
      const n = parseFloat(s.trim());
      return isNaN(n) ? null : n;
    };

    const rowRe = /<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g;
    const ipos = [];
    let rowMatch;

    while ((rowMatch = rowRe.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      for (const m of rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) {
        cells.push(m[1]);
      }
      if (cells.length < 8) continue;

      const companyHref = (cells[0].match(/href="([^"]+)"/) || [])[1] || null;
      const company = stripTags(cells[0]);
      const tickerMatch = cells[1].match(/\?s=([^"&]+)/);
      const ticker = tickerMatch ? tickerMatch[1] : stripTags(cells[1]);
      const leadManagersRaw = stripTags(cells[2]);
      const leadManagers = leadManagersRaw
        ? leadManagersRaw.split("/").map((s) => s.trim()).filter(Boolean)
        : [];
      const sharesMil = parseFloat2(stripTags(cells[3]));
      const priceLow = parseFloat2(stripTags(cells[4]));
      const priceHigh = parseFloat2(stripTags(cells[5]));
      const priceRange =
        priceLow != null && priceHigh != null
          ? `$${priceLow.toFixed(2)} - $${priceHigh.toFixed(2)}`
          : null;
      const volRaw = stripTags(cells[6]);
      const volMatch = volRaw.match(/\$\s*([\d,.]+)\s*mil/i);
      const estVolumeMil = volMatch
        ? parseFloat(volMatch[1].replace(/,/g, ""))
        : null;
      const tradeDateRaw = stripTags(cells[7]);
      const dateMatch = tradeDateRaw.match(/^(\d+\/\d+\/\d+)\s*(.*)?$/);
      const expectedTradeDate = dateMatch ? dateMatch[1] : tradeDateRaw;
      const status = dateMatch && dateMatch[2] ? dateMatch[2].trim() : null;

      ipos.push({
        company,
        detailUrl: companyHref
          ? `https://www.iposcoop.com${companyHref}`
          : null,
        ticker,
        leadManagers,
        sharesMil,
        priceLow,
        priceHigh,
        priceRange,
        estVolumeMil,
        expectedTradeDate,
        status,
        sector: null,
      });
    }

    // Fetch sector/industry from detail pages in parallel
    await Promise.all(
      ipos.map(async (ipo) => {
        if (!ipo.detailUrl) return;
        try {
          const dr = await fetch(ipo.detailUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(6000),
          });
          if (!dr.ok) return;
          const dHtml = await dr.text();
          const secMatch = dHtml.match(/<strong>Industry<\/strong><\/td>[\s\S]{0,80}?<td>([^<]{1,60})<\/td>/);
          if (secMatch) ipo.sector = secMatch[1].trim();
        } catch { /* leave null */ }
      })
    );

    return res.status(200).json({
      source: "iposcoop.com",
      fetchedAt: new Date().toISOString(),
      count: ipos.length,
      ipos,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, ipos: [] });
  }
}
