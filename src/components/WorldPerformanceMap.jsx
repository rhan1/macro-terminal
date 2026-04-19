import { useMemo, useState } from "react";
import worldTopology from "../data/worldGeoJson.json";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";
const LAND = "hsl(220,15%,14%)";
const STROKE = "hsl(220,15%,20%)";
const NUM_TO_ALPHA2 = {
  "36": "AU", "44": "BS", "76": "BR", "124": "CA", "156": "CN", "158": "TW",
  "250": "FR", "276": "DE", "344": "HK", "356": "IN", "380": "IT", "392": "JP",
  "410": "KR", "484": "MX", "528": "NL", "724": "ES", "756": "CH", "826": "GB",
  "840": "US",
};

const WIDTH = 960;
const HEIGHT = 500;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmtPct = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const fmtPrice = (n) =>
  n == null ? "—" : typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);

const fillForPct = (pct) => {
  if (pct == null || Number.isNaN(pct)) return LAND;
  if (Math.abs(pct) < 0.05) return "hsl(220,10%,30%)";
  if (pct > 0) return `hsl(142,70%,${35 + (clamp(pct, 0, 3) / 3) * 25}%)`;
  return `hsl(0,72%,${35 + (clamp(-pct, 0, 3) / 3) * 25}%)`;
};

const mercatorPoint = (lon, lat) => {
  const safeLat = clamp(lat, -85, 85);
  const rad = (safeLat * Math.PI) / 180;
  return [
    ((lon + 180) * WIDTH) / 360,
    HEIGHT / 2 - (WIDTH * Math.log(Math.tan(Math.PI / 4 + rad / 2))) / (2 * Math.PI),
  ];
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
  let d = "";
  let first = true;
  ring.forEach((arcIndex) => {
    const pts = decodeArc(arcIndex, arcs, scale, translate, cache);
    pts.forEach(([x, y], i) => {
      if (!first && i === 0) return;
      d += `${first ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      first = false;
    });
  });
  return d ? `${d}Z` : "";
}

export default function WorldPerformanceMap({ indexData = {} }) {
  const [hoveredIso, setHoveredIso] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const features = useMemo(() => {
    const { arcs, transform, objects } = worldTopology;
    const cache = new Map();
    return objects.countries.geometries.map((geom) => {
      const iso = NUM_TO_ALPHA2[String(geom.id).padStart(3, "0")] || NUM_TO_ALPHA2[String(geom.id)] || null;
      const polygons = geom.type === "Polygon" ? [geom.arcs] : geom.arcs;
      const pathD = polygons
        .map((polygon) =>
          polygon.map((ring) => ringToPath(ring, arcs, transform.scale, transform.translate, cache)).join("")
        )
        .join("");
      return { iso, name: geom.properties?.name || "Unknown", pathD };
    });
  }, []);

  const activeFeature = useMemo(() => {
    if (!hoveredIso) return null;
    if (hoveredIso.startsWith("name:")) return features.find((f) => f.name === hoveredIso.slice(5)) || null;
    return features.find((f) => f.iso === hoveredIso) || null;
  }, [features, hoveredIso]);
  const hoveredData = activeFeature?.iso ? indexData[activeFeature.iso] : null;
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
          const pct = feature.iso ? indexData[feature.iso]?.changePct : null;
          return (
            <path
              key={`${feature.name}-${i}`}
              d={feature.pathD}
              data-iso={feature.iso || ""}
              data-name={feature.name}
              fill={fillForPct(pct)}
              stroke={STROKE}
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 10px" }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Daily Change</span>
        <svg width="240" height="10" viewBox="0 0 240 10" aria-hidden="true">
          <defs>
            <linearGradient id="world-performance-legend" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={RED} />
              <stop offset="50%" stopColor="hsl(220,10%,30%)" />
              <stop offset="100%" stopColor={GREEN} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="240" height="10" fill="url(#world-performance-legend)" stroke={BORDER} strokeWidth="1" />
        </svg>
        <span style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>-3%</span>
        <span style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>0</span>
        <span style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>+3%</span>
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
              <div style={{ color: DIM, fontSize: 10, marginBottom: 8 }}>
                {hoveredData.symbol} {hoveredData.name ? `· ${hoveredData.name}` : ""}
              </div>
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
