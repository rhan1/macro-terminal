import { useMemo, useState } from "react";
import worldTopology from "../data/worldGeoJson.json";

const GREEN = "hsl(142,80%,45%)";
const RED = "hsl(0,80%,45%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,35%)";
const LAND = "hsl(220,10%,18%)";
const NEUTRAL = "hsl(220,10%,30%)";
const STROKE = "hsl(220,15%,35%)";
const LABEL = "hsl(220,15%,92%)";
const TOP_ECONOMIES = new Set(["US", "CN", "JP", "DE", "GB", "IN", "FR", "IT", "BR", "CA"]);
const LABEL_OFFSETS = {
  US: [0, 0],
  CN: [0, 0],
  JP: [10, 0],
  DE: [-10, -8],
  GB: [-25, -5],
  FR: [-15, 12],
  IT: [8, 15],
  IN: [0, 10],
  BR: [0, 0],
  CA: [0, -8],
};
const NUM_TO_ALPHA2 = {
  "36": "AU", "44": "BS", "76": "BR", "124": "CA", "156": "CN", "158": "TW", "250": "FR", "276": "DE",
  "344": "HK", "356": "IN", "380": "IT", "392": "JP", "410": "KR", "484": "MX", "528": "NL", "724": "ES",
  "756": "CH", "826": "GB", "840": "US",
};

const WIDTH = 960;
const HEIGHT = 500;
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
const LEADER_THRESHOLD = 10;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmtPct = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const fmtLabelPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtPrice = (n) => (n == null ? "—" : typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n));

const mixHsl = ([h1, s1, l1], [h2, s2, l2], t) =>
  `hsl(${h1 + (h2 - h1) * t},${s1 + (s2 - s1) * t}%,${l1 + (l2 - l1) * t}%)`;

const fillForPct = (pct) => {
  if (pct == null || Number.isNaN(pct)) return LAND;
  if (Math.abs(pct) < 0.05) return NEUTRAL;
  if (pct > 0) {
    const t = clamp(pct, 0, 3) / 3;
    return t < 1 / 3 ? mixHsl([220, 10, 30], [95, 70, 50], t * 3) : mixHsl([95, 70, 50], [142, 80, 45], (t - 1 / 3) * 1.5);
  }
  const t = clamp(-pct, 0, 3) / 3;
  return t < 1 / 3 ? mixHsl([220, 10, 30], [20, 70, 50], t * 3) : mixHsl([20, 70, 50], [0, 80, 45], (t - 1 / 3) * 1.5);
};

const mercatorPoint = (lon, lat) => {
  const safeLat = clamp(lat, -85, 85);
  const rad = (safeLat * Math.PI) / 180;
  return [((lon + 180) * WIDTH) / 360, HEIGHT / 2 - (WIDTH * Math.log(Math.tan(Math.PI / 4 + rad / 2))) / (2 * Math.PI)];
};

function decodeArc(arcIndex, arcs, scale, translate, cache) {
  const key = String(arcIndex);
  if (cache.has(key)) return cache.get(key);
  const rawIndex = arcIndex < 0 ? ~arcIndex : arcIndex;
  let x = 0;
  let y = 0;
  const points = arcs[rawIndex].map(([dx, dy]) => {
    x += dx;
    y += dy;
    const lon = x * scale[0] + translate[0];
    const lat = y * scale[1] + translate[1];
    return mercatorPoint(lon, lat);
  });
  const decoded = arcIndex < 0 ? [...points].reverse() : points;
  cache.set(key, decoded);
  return decoded;
}

function ringToPath(ring, arcs, scale, translate, cache) {
  // Rings that cross the antimeridian (Russia, Fiji, Antarctica) jump from
  // x≈960 to x≈0 between consecutive points; drawing that as an L produced
  // filled slivers across the whole map ("gray tearing bands", visible at
  // mobile widths). Break the path into a new subpath on any half-width jump.
  let d = "";
  let first = true;
  let prevX = null;
  ring.forEach((arcIndex) => {
    const pts = decodeArc(arcIndex, arcs, scale, translate, cache);
    pts.forEach(([x, y], i) => {
      if (!first && i === 0) return;
      const wraps = prevX !== null && Math.abs(x - prevX) > 480;
      d += `${first || wraps ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      first = false;
      prevX = x;
    });
  });
  return d ? `${d}Z` : "";
}

const ringCentroid = (points) => {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-6) return points[Math.floor(points.length / 2)] || [0, 0];
  return [x / (3 * area), y / (3 * area)];
};

const featureCentroid = (polygons, arcs, scale, translate, cache) => {
  let best = null;
  polygons.forEach((polygon) => {
    const outer = polygon[0].flatMap((arcIndex) => decodeArc(arcIndex, arcs, scale, translate, cache));
    if (outer.length < 3) return;
    const [cx, cy] = ringCentroid(outer);
    const area = Math.abs(outer.reduce((sum, [x1, y1], i) => {
      const [x2, y2] = outer[(i + 1) % outer.length];
      return sum + x1 * y2 - x2 * y1;
    }, 0)) / 2;
    if (!best || area > best.area) best = { area, x: cx, y: cy };
  });
  return best ? [best.x, best.y] : null;
};

export default function WorldPerformanceMap({ indexData = {}, countries = [] }) {
  const [hoveredIso, setHoveredIso] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const dataByCountry = useMemo(() => {
    if (indexData && Object.keys(indexData).length) return indexData;
    return countries.reduce((acc, country) => {
      if (country?.countryCode) acc[country.countryCode] = country;
      return acc;
    }, {});
  }, [countries, indexData]);

  const features = useMemo(() => {
    const { arcs, transform, objects } = worldTopology;
    const cache = new Map();
    return objects.countries.geometries.map((geom) => {
      const iso = NUM_TO_ALPHA2[String(geom.id).padStart(3, "0")] || NUM_TO_ALPHA2[String(geom.id)] || null;
      const polygons = geom.type === "Polygon" ? [geom.arcs] : geom.arcs;
      const pathD = polygons.map((polygon) => polygon.map((ring) => ringToPath(ring, arcs, transform.scale, transform.translate, cache)).join("")).join("");
      const centroid = featureCentroid(polygons, arcs, transform.scale, transform.translate, cache);
      return { iso, name: geom.properties?.name || "Unknown", pathD, centroid };
    });
  }, []);

  const activeFeature = useMemo(() => {
    if (!hoveredIso) return null;
    if (hoveredIso.startsWith("name:")) return features.find((f) => f.name === hoveredIso.slice(5)) || null;
    return features.find((f) => f.iso === hoveredIso) || null;
  }, [features, hoveredIso]);
  const hoveredData = activeFeature?.iso ? dataByCountry[activeFeature.iso] : null;
  const weekPct =
    hoveredData?.weekPct ?? hoveredData?.weeklyPct ?? hoveredData?.changePctWeek ?? hoveredData?.weekChangePct ?? null;

  const handleMove = (evt) => {
    const path = evt.target.closest("path[data-name]");
    if (!path) {
      setHoveredIso(null);
      return;
    }
    setHoveredIso(path.dataset.iso || `name:${path.dataset.name}`);
    setTooltipPos({ x: evt.clientX + 14, y: evt.clientY + 14 });
  };

  return (
    <div style={{ width: "100%", height: 460, background: "hsl(220,20%,7%)", position: "relative" }}>
      <svg
        viewBox="0 0 960 500"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "calc(100% - 34px)", display: "block" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoveredIso(null)}
      >
        {features.map((feature, i) => {
          const pct = feature.iso ? dataByCountry[feature.iso]?.changePct : null;
          return <path key={`${feature.name}-${i}`} d={feature.pathD} data-iso={feature.iso || ""} data-name={feature.name} fill={fillForPct(pct)} stroke={STROKE} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />;
        })}
        {features.map((feature) => {
          const data = feature.iso ? dataByCountry[feature.iso] : null;
          if (!feature.iso || !feature.centroid || !TOP_ECONOMIES.has(feature.iso) || data?.changePct == null) return null;
          const [x, y] = feature.centroid;
          const [dx, dy] = LABEL_OFFSETS[feature.iso] || [0, 0];
          const labelX = x + dx;
          const labelY = y + dy;
          const label = `${feature.iso} ${fmtLabelPct(data.changePct)}`;
          const labelWidth = label.length * 5.5 + LABEL_PAD_X * 2;
          const labelHeight = 9 + LABEL_PAD_Y * 2;
          const needsLeader = Math.hypot(dx, dy) > LEADER_THRESHOLD;
          return (
            <g key={`label-${feature.iso}`} pointerEvents="none">
              {needsLeader && (
                <line
                  x1={x}
                  y1={y}
                  x2={labelX}
                  y2={labelY}
                  stroke="hsla(220, 15%, 60%, 0.4)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <rect
                x={labelX - labelWidth / 2}
                y={labelY - labelHeight / 2}
                width={labelWidth}
                height={labelHeight}
                rx="3"
                fill="hsla(220, 30%, 5%, 0.75)"
              />
              <text
                x={labelX}
                y={labelY}
                fill={LABEL}
                fontSize="9"
                fontFamily='"JetBrains Mono", monospace'
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ textShadow: "0 1px 2px hsla(220,30%,5%,0.35)" }}
              >{label}</text>
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 10px" }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Daily Change</span>
        <svg width="240" height="16" viewBox="0 0 240 16" aria-hidden="true">
          <defs>
            <linearGradient id="world-performance-legend" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={RED} /><stop offset="33%" stopColor="hsl(20,70%,50%)" />
              <stop offset="50%" stopColor={NEUTRAL} /><stop offset="67%" stopColor="hsl(95,70%,50%)" /><stop offset="100%" stopColor={GREEN} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="240" height="10" fill="url(#world-performance-legend)" stroke={BORDER} strokeWidth="1" />
          <rect x="0" y="12" width="18" height="4" fill={RED} />
          <rect x="56" y="12" width="18" height="4" fill="hsl(20,70%,50%)" />
          <rect x="111" y="12" width="18" height="4" fill={NEUTRAL} />
          <rect x="166" y="12" width="18" height="4" fill="hsl(95,70%,50%)" />
          <rect x="222" y="12" width="18" height="4" fill={GREEN} />
        </svg>
        <span style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>-3% ─ 0 ─ +3%</span>
      </div>

      {activeFeature && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.x,
            top: tooltipPos.y,
            width: 220,
            background: "hsla(220,20%,8%,0.96)",
            border: `1px solid ${BORDER}`,
            padding: "8px 10px",
            pointerEvents: "none",
            zIndex: 20,
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ color: "#f4f7fb", fontSize: 12, marginBottom: 6 }}>
            {hoveredData?.flag ? `${hoveredData.flag} ` : ""}{activeFeature.name}
          </div>
          {hoveredData ? (
            <>
              <div style={{ color: DIM, fontSize: 10, marginBottom: 8 }}>{hoveredData.symbol} {hoveredData.name ? `· ${hoveredData.name}` : ""}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 8px", fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
                <span style={{ color: DIM }}>Price</span><span style={{ color: "#f4f7fb" }}>{fmtPrice(hoveredData.price)}</span>
                <span style={{ color: DIM }}>Day</span><span style={{ color: hoveredData.changePct == null ? DIM : hoveredData.changePct >= 0 ? GREEN : RED }}>{fmtPct(hoveredData.changePct)}</span>
                <span style={{ color: DIM }}>Week</span><span style={{ color: weekPct == null ? DIM : weekPct >= 0 ? GREEN : RED }}>{fmtPct(weekPct)}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: DIM, fontSize: 10, marginBottom: 8 }}>No index tracked</div>
              <div style={{ color: DIM, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>No data</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
