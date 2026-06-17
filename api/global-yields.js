// Serves the sovereign yield Blob written by /api/cron/refresh-global-yields.
// Computes Bund-UST and BTP-Bund spreads on-serve so the cron stays simple.
import { getJSON } from "../netlify/lib/netlify-blob.mjs";

const BLOB_PATH = "global/yields.json";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  try {
    const body = await getJSON(BLOB_PATH);
    if (!body) throw new Error("not-seeded");

    const usEntry = (body.yields || []).find((y) => y.countryCode === "US");
    const deEntry = (body.yields || []).find((y) => y.countryCode === "DE");
    const us = usEntry?.value ?? null;
    const de = deEntry?.value ?? null;

    const enriched = (body.yields || []).map((y) => ({
      ...y,
      spreadUs:
        us != null && y.value != null && y.countryCode !== "US"
          ? Number(((y.value - us) * 100).toFixed(1))
          : null,
    }));

    const stress = {};
    if (us != null && de != null) stress.bundMinusUst = Number(((de - us) * 100).toFixed(1));
    const itEntry = (body.yields || []).find((y) => y.countryCode === "IT");
    if (itEntry?.value != null && de != null) stress.btpMinusBund = Number(((itEntry.value - de) * 100).toFixed(1));

    return res.status(200).json({
      yields: enriched,
      stress,
      fetchedAt: body.fetchedAt,
    });
  } catch {
    return res.status(200).json({
      yields: [],
      stress: {},
      fetchedAt: null,
      error: "not-seeded",
    });
  }
}
