const SERIES = {
  PSAVERT: {
    name: "Personal Savings Rate",
    unit: "%",
    frequency: "monthly",
  },
  DRCCLACBS: {
    name: "Delinquency Rate on Credit Card Loans",
    unit: "%",
    frequency: "quarterly",
  },
  CCLACBW027SBOG: {
    name: "Consumer Credit Card Balances",
    unit: "billions $",
    frequency: "weekly",
  },
  ICSA: {
    name: "Initial Claims for Unemployment",
    unit: "thousands",
    frequency: "weekly",
  },
};

async function fetchSeries(seriesId, apiKey) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "24",
  });

  const url = `https://api.stlouisfed.org/fred/series/observations?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FRED ${seriesId}: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.observations || [];
}

function parseObservations(observations) {
  return observations
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

export default async function handler(req, res) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FRED_API_KEY not configured" });
  }

  const seriesIds = Object.keys(SERIES);

  const results = await Promise.allSettled(
    seriesIds.map((id) => fetchSeries(id, apiKey))
  );

  const signals = {};

  for (let i = 0; i < seriesIds.length; i++) {
    const id = seriesIds[i];
    const result = results[i];
    const meta = SERIES[id];

    if (result.status === "rejected") {
      signals[id] = { name: meta.name, unit: meta.unit, frequency: meta.frequency, error: result.reason.message };
      continue;
    }

    // Descending from FRED: index 0 = latest, index 1 = prior
    const parsed = parseObservations(result.value);

    const latestEntry = parsed[0] || null;
    const priorEntry = parsed[1] || null;

    const latestVal = latestEntry ? latestEntry.value : null;
    const priorVal = priorEntry ? priorEntry.value : null;

    const change =
      latestVal !== null && priorVal !== null
        ? parseFloat((latestVal - priorVal).toFixed(4))
        : null;

    const trend =
      change === null ? "flat" : change > 0 ? "up" : change < 0 ? "down" : "flat";

    // Reverse to chronological order (oldest first) for charting
    const data = [...parsed].reverse();

    signals[id] = {
      name: meta.name,
      unit: meta.unit,
      frequency: meta.frequency,
      latest: latestEntry,
      prior: priorEntry,
      change,
      trend,
      data,
    };
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  return res.status(200).json({
    signals,
    updated: new Date().toISOString(),
  });
}
