export default async function handler(req, res) {
  try {
    const resp = await fetch("https://www.crashwatch.live/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!resp.ok) throw new Error(`crashwatch.live responded: ${resp.status}`);

    const html = await resp.text();

    // ------------------------------------------------------------------
    // 1. Try __NEXT_DATA__ first (canonical Next.js data island)
    // ------------------------------------------------------------------
    let nextData = null;
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (nextDataMatch) {
      try {
        nextData = JSON.parse(nextDataMatch[1]);
      } catch (_) {
        // malformed JSON — fall through to regex scraping
      }
    }

    // Helper: deep-search an object/array for the first value matching a key
    function deepFind(obj, key) {
      if (obj === null || typeof obj !== "object") return undefined;
      if (key in obj) return obj[key];
      for (const v of Object.values(obj)) {
        const found = deepFind(v, key);
        if (found !== undefined) return found;
      }
      return undefined;
    }

    // ------------------------------------------------------------------
    // 2. Parse with __NEXT_DATA__ when available
    // ------------------------------------------------------------------
    let nationalScore = null;
    let distribution = { safe: null, watch: null, stress: null, danger: null };
    let mortgageRate = null;
    let fedRate = null;
    let metros = [];
    let sentimentScore = null;
    let housingStarts = null;

    if (nextData) {
      const props = deepFind(nextData, "props") || nextData;

      // National stress score
      nationalScore =
        deepFind(props, "nationalScore") ??
        deepFind(props, "stressScore") ??
        deepFind(props, "overallScore") ??
        deepFind(props, "score") ??
        null;

      // Distribution
      const dist =
        deepFind(props, "distribution") ??
        deepFind(props, "stressDistribution") ??
        null;
      if (dist && typeof dist === "object") {
        distribution.safe =
          dist.safe ?? dist.Safe ?? dist.SAFE ?? null;
        distribution.watch =
          dist.watch ?? dist.Watch ?? dist.WATCH ?? null;
        distribution.stress =
          dist.stress ?? dist.Stress ?? dist.STRESS ?? null;
        distribution.danger =
          dist.danger ?? dist.Danger ?? dist.DANGER ?? null;
      }

      // Rates
      mortgageRate =
        deepFind(props, "mortgageRate") ??
        deepFind(props, "mortgage_rate") ??
        null;
      fedRate =
        deepFind(props, "fedRate") ??
        deepFind(props, "fed_rate") ??
        deepFind(props, "federalFundsRate") ??
        null;

      // Metros
      const metroList =
        deepFind(props, "metros") ??
        deepFind(props, "topMetros") ??
        deepFind(props, "cities") ??
        [];
      if (Array.isArray(metroList)) {
        metros = metroList.slice(0, 10).map((m) => ({
          name: m.name ?? m.city ?? m.metro ?? null,
          score: m.score ?? m.stressScore ?? m.value ?? null,
          level: m.level ?? m.status ?? null,
        }));
      }

      // Sentiment
      sentimentScore =
        deepFind(props, "sentimentScore") ??
        deepFind(props, "sentiment") ??
        deepFind(props, "marketSentiment") ??
        null;

      // Housing starts
      housingStarts =
        deepFind(props, "housingStarts") ??
        deepFind(props, "housing_starts") ??
        null;
    }

    // ------------------------------------------------------------------
    // 3. Regex fallback — scrape visible text / JSON fragments from HTML
    // ------------------------------------------------------------------

    // National score (e.g. "score":57 or "nationalScore":57)
    if (nationalScore === null) {
      const m =
        html.match(/"nationalScore"\s*:\s*([\d.]+)/) ??
        html.match(/"stressScore"\s*:\s*([\d.]+)/) ??
        html.match(/"overallScore"\s*:\s*([\d.]+)/);
      if (m) nationalScore = parseFloat(m[1]);
    }

    // Distribution percentages (e.g. "safe":18 or "Safe":18)
    if (distribution.safe === null) {
      const safe = html.match(/"[Ss]afe"\s*:\s*([\d.]+)/);
      const watch = html.match(/"[Ww]atch"\s*:\s*([\d.]+)/);
      const stress = html.match(/"[Ss]tress"\s*:\s*([\d.]+)/);
      const danger = html.match(/"[Dd]anger"\s*:\s*([\d.]+)/);
      if (safe) distribution.safe = parseFloat(safe[1]);
      if (watch) distribution.watch = parseFloat(watch[1]);
      if (stress) distribution.stress = parseFloat(stress[1]);
      if (danger) distribution.danger = parseFloat(danger[1]);
    }

    // Mortgage rate
    if (mortgageRate === null) {
      const m =
        html.match(/"mortgageRate"\s*:\s*([\d.]+)/) ??
        html.match(/"mortgage_rate"\s*:\s*([\d.]+)/) ??
        html.match(/mortgage\s+rate[^0-9]*([\d.]+)%/i);
      if (m) mortgageRate = parseFloat(m[1]);
    }

    // Fed rate
    if (fedRate === null) {
      const m =
        html.match(/"fedRate"\s*:\s*([\d.]+)/) ??
        html.match(/"fed_rate"\s*:\s*([\d.]+)/) ??
        html.match(/"federalFundsRate"\s*:\s*([\d.]+)/) ??
        html.match(/fed(?:eral)?\s+(?:funds\s+)?rate[^0-9]*([\d.]+)%/i);
      if (m) fedRate = parseFloat(m[1]);
    }

    // Metros — look for array patterns in JSON blobs embedded in HTML
    if (metros.length === 0) {
      // Try to find an array of metro objects with name+score fields
      const metroArrayMatch = html.match(
        /\[\s*\{\s*"(?:name|city|metro)"\s*:\s*"[^"]+"\s*,[\s\S]{0,500}?\}\s*(?:,\s*\{\s*"(?:name|city|metro)"\s*:\s*"[^"]+"\s*,[\s\S]{0,500}?\}\s*){1,20}\]/
      );
      if (metroArrayMatch) {
        try {
          const arr = JSON.parse(metroArrayMatch[0]);
          metros = arr.slice(0, 10).map((m) => ({
            name: m.name ?? m.city ?? m.metro ?? null,
            score: m.score ?? m.stressScore ?? m.value ?? null,
            level: m.level ?? m.status ?? null,
          }));
        } catch (_) {
          // unparseable fragment
        }
      }
    }

    // Sentiment score
    if (sentimentScore === null) {
      const m =
        html.match(/"sentimentScore"\s*:\s*([\d.]+)/) ??
        html.match(/"sentiment"\s*:\s*([\d.]+)/) ??
        html.match(/"marketSentiment"\s*:\s*([\d.]+)/);
      if (m) sentimentScore = parseFloat(m[1]);
    }

    // Housing starts — handle "1.5K" / "1500" / "1.5" forms
    if (housingStarts === null) {
      const m =
        html.match(/"housingStarts"\s*:\s*([\d.]+)/) ??
        html.match(/"housing_starts"\s*:\s*([\d.]+)/) ??
        html.match(/housing\s+starts[^0-9]*([\d.]+)\s*[Kk]/i) ??
        html.match(/housing\s+starts[^0-9]*([\d,]+)/i);
      if (m) {
        const raw = m[1].replace(/,/g, "");
        // If matched with K suffix convert to thousands
        const kMatch = html.match(
          /housing\s+starts[^0-9]*([\d.]+)\s*[Kk]/i
        );
        housingStarts = kMatch
          ? parseFloat(kMatch[1]) * 1000
          : parseFloat(raw);
      }
    }

    // ------------------------------------------------------------------
    // 4. Assemble response
    // ------------------------------------------------------------------
    const result = {
      nationalScore,
      distribution,
      mortgageRate,
      fedRate,
      metros,
      sentimentScore,
      housingStarts,
    };

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=172800"
    );
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({
      nationalScore: null,
      distribution: { safe: null, watch: null, stress: null, danger: null },
      mortgageRate: null,
      fedRate: null,
      metros: [],
      sentimentScore: null,
      housingStarts: null,
      error: err.message,
    });
  }
}
