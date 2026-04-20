import { put } from "@vercel/blob";

const BLOB_PATH = "shipments/portwatch.json";
const BASE_URL = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
const SOURCE_MAP = [
  { name: "Suez Canal", portname: "Suez Canal", unique: true, sourceChokepoint: null },
  { name: "Bab el-Mandeb", portname: "Bab el-Mandeb Strait", unique: true, sourceChokepoint: null },
  { name: "Strait of Hormuz", portname: "Strait of Hormuz", unique: true, sourceChokepoint: null },
  { name: "Red Sea South", portname: "Bab el-Mandeb Strait", unique: false, sourceChokepoint: "Bab el-Mandeb" },
  { name: "Red Sea North", portname: "Suez Canal", unique: false, sourceChokepoint: "Suez Canal" },
  { name: "Gulf of Aden", portname: "Bab el-Mandeb Strait", unique: false, sourceChokepoint: "Bab el-Mandeb" },
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeFeature(feature) {
  const attrs = feature?.attributes || {};
  const container = toNumber(attrs.n_container);
  const tanker = toNumber(attrs.n_tanker);
  const dryBulk = toNumber(attrs.n_dry_bulk);
  const other = toNumber(attrs.n_general_cargo) + toNumber(attrs.n_roro);
  const total = toNumber(attrs.n_total) || container + tanker + dryBulk + other;
  const date = formatDate(attrs.date);
  if (!date) return null;
  return { date, total, container, tanker, dryBulk, other };
}

async function fetchPortwatchSeries(portname) {
  const params = new URLSearchParams({
    where: `portname='${portname}'`,
    outFields: "*",
    orderByFields: "date DESC",
    resultRecordCount: "90",
    f: "json",
  });
  const resp = await fetch(`${BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`portwatch ${resp.status}`);

  const json = await resp.json();
  if (json?.error) throw new Error(json.error.message || "arcgis error");

  return (Array.isArray(json?.features) ? json.features : [])
    .map(normalizeFeature)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeChokepoint({ name, unique, sourceChokepoint }, trend90d) {
  const latest = trend90d[trend90d.length - 1];
  const transits7d = trend90d.slice(-7).reduce((sum, day) => sum + toNumber(day?.total), 0);
  const transitsPerDay = Number((transits7d / 7).toFixed(1));
  if (!latest) {
    return {
      name,
      unique,
      sourceChokepoint,
      latestDate: null,
      totalCalls: 0,
      transits7d,
      transitsPerDay,
      byType: { container: 0, tanker: 0, dryBulk: 0, other: 0 },
      trend90d: [],
    };
  }

  return {
    name,
    unique,
    sourceChokepoint,
    latestDate: latest.date,
    totalCalls: latest.total,
    transits7d,
    transitsPerDay,
    byType: {
      container: latest.container,
      tanker: latest.tanker,
      dryBulk: latest.dryBulk,
      other: latest.other,
    },
    trend90d,
  };
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

    const settled = await Promise.allSettled(
      SOURCE_MAP.map(async ({ name, portname }) => ({
        name,
        portname,
        trend90d: await fetchPortwatchSeries(portname),
      }))
    );

    const errors = {};
    const chokepoints = SOURCE_MAP.map((meta, index) => {
      const result = settled[index];
      if (result.status === "fulfilled") return summarizeChokepoint(meta, result.value.trend90d);
      errors[meta.name] = result.reason?.message || "failed";
      return summarizeChokepoint(meta, []);
    });

    const payload = {
      updatedAt: new Date().toISOString(),
      chokepoints,
      ...(Object.keys(errors).length ? { errors } : {}),
    };

    await put(BLOB_PATH, JSON.stringify(payload), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({
      ok: true,
      updatedAt: payload.updatedAt,
      chokepoints: chokepoints.map((item) => ({
        name: item.name,
        unique: item.unique,
        sourceChokepoint: item.sourceChokepoint,
        latestDate: item.latestDate,
        totalCalls: item.totalCalls,
      })),
      errors,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "refresh failed" });
  }
}
