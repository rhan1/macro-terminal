import { useMemo, useState } from "react";
import worldTopology from "../data/worldGeoJson.json";

const WIDTH = 800;
const HEIGHT = 400;
const BG = "hsl(220,20%,7%)";
const LAND = "hsl(220, 10%, 18%)";
const STROKE = "hsl(220, 15%, 35%)";
const BORDER = "hsl(220,15%,14%)";
const DIM = "var(--color-term-dim, hsl(220,10%,52%))";
const TEXT = "var(--color-term-text, hsl(220,15%,88%))";
const AMBER = "hsl(45, 90%, 55%)";
const ORANGE = "hsl(20, 80%, 55%)";
const RED = "hsl(0, 72%, 55%)";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const CHOKEPOINTS = [
  { name: "BAB EL-MANDEB", bounds: { north: 13, south: 12, west: 43, east: 44 } },
  { name: "RED SEA SOUTH", bounds: { north: 20, south: 13, west: 38, east: 43 } },
  { name: "RED SEA NORTH", bounds: { north: 30, south: 20, west: 32, east: 38 } },
  { name: "SUEZ CANAL", bounds: { north: 32, south: 30, west: 32, east: 33 } },
  { name: "GULF OF ADEN", bounds: { north: 15, south: 11, west: 43, east: 52 } },
  { name: "STRAIT OF HORMUZ", bounds: { north: 27, south: 25, west: 55, east: 58 } },
];

function mercatorPoint(lon, lat, width, height) {
  const safeLat = clamp(lat, -85, 85);
  const rad = (safeLat * Math.PI) / 180;
  return [
    ((lon + 180) * width) / 360,
    height / 2 - (width * Math.log(Math.tan(Math.PI / 4 + rad / 2))) / (2 * Math.PI),
  ];
}

function decodeArc(arcIndex, arcs, scale, translate, cache, width, height) {
  const key = `${arcIndex}:${width}:${height}`;
  if (cache.has(key)) return cache.get(key);
  const rawIndex = arcIndex < 0 ? ~arcIndex : arcIndex;
  let x = 0;
  let y = 0;
  const points = arcs[rawIndex].map(([dx, dy]) => {
    x += dx;
    y += dy;
    const lon = x * scale[0] + translate[0];
    const lat = y * scale[1] + translate[1];
    return mercatorPoint(lon, lat, width, height);
  });
  const decoded = arcIndex < 0 ? [...points].reverse() : points;
  cache.set(key, decoded);
  return decoded;
}

function ringToPath(ring, arcs, scale, translate, cache, width, height) {
  let d = "";
  let first = true;
  ring.forEach((arcIndex) => {
    const pts = decodeArc(arcIndex, arcs, scale, translate, cache, width, height);
    pts.forEach(([x, y], i) => {
      if (!first && i === 0) return;
      d += `${first ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      first = false;
    });
  });
  return d ? `${d}Z` : "";
}

function incidentColor(fatalities) {
  if (!fatalities) return AMBER;
  if (fatalities <= 5) return ORANGE;
  return RED;
}

function incidentRadius(fatalities) {
  if (!fatalities) return 3;
  return clamp(3 + Math.min(fatalities, 10) * 0.4, 3, 7);
}

function formatFatalities(fatalities) {
  return Number.isFinite(fatalities) ? fatalities : 0;
}

function tooltipLabel(incident) {
  return `${incident.location || "Unknown"} · ${incident.eventType || "Incident"} · ${formatFatalities(incident.fatalities)} K · ${incident.date || "—"}`;
}

export default function ShipmentsMap({ incidents, chokepoints, width = WIDTH, height = HEIGHT }) {
  const [tooltip, setTooltip] = useState(null);
  const incidentList = Array.isArray(incidents) ? incidents : [];
  const isLoading = incidents == null;
  const chokepointStats = Array.isArray(chokepoints) ? chokepoints : [];

  const features = useMemo(() => {
    const { arcs, transform, objects } = worldTopology;
    const cache = new Map();
    return objects.countries.geometries.map((geom, i) => {
      const polygons = geom.type === "Polygon" ? [geom.arcs] : geom.arcs;
      const pathD = polygons
        .map((polygon) =>
          polygon.map((ring) => ringToPath(ring, arcs, transform.scale, transform.translate, cache, width, height)).join("")
        )
        .join("");
      return { id: `${geom.id || geom.properties?.name || "country"}-${i}`, pathD };
    });
  }, [width, height]);

  const renderedChokepoints = useMemo(
    () =>
      CHOKEPOINTS.map((item, index) => {
        const stats = chokepointStats.find(
          (entry) => entry?.name?.trim().toUpperCase() === item.name.toUpperCase()
        );
        const nw = mercatorPoint(item.bounds.west, item.bounds.north, width, height);
        const se = mercatorPoint(item.bounds.east, item.bounds.south, width, height);
        const x = Math.min(nw[0], se[0]);
        const y = Math.min(nw[1], se[1]);
        const rectWidth = Math.max(8, Math.abs(se[0] - nw[0]));
        const rectHeight = Math.max(8, Math.abs(se[1] - nw[1]));
        const centerX = x + rectWidth / 2;
        const centerY = y + rectHeight / 2;
        return {
          ...item,
          index: index + 1,
          transits7d: stats?.transits7d ?? null,
          transitsPerDay: stats?.transitsPerDay ?? null,
          x,
          y,
          rectWidth,
          rectHeight,
          centerX,
          centerY,
        };
      }),
    [chokepointStats, width, height]
  );

  const plottedIncidents = useMemo(() => {
    return incidentList
      .filter((incident) => Number.isFinite(incident?.lng) && Number.isFinite(incident?.lat))
      .map((incident, index) => {
        const [cx, cy] = mercatorPoint(incident.lng, incident.lat, width, height);
        const fatalities = formatFatalities(incident.fatalities);
        return {
          ...incident,
          index,
          cx,
          cy,
          fill: incidentColor(fatalities),
          radius: incidentRadius(fatalities),
        };
      });
  }, [incidentList, width, height]);

  const handleMove = (evt) => {
    const marker = evt.target.closest("[data-incident-index]");
    if (!marker) {
      setTooltip(null);
      return;
    }
    const incident = plottedIncidents[Number(marker.dataset.incidentIndex)];
    if (!incident) {
      setTooltip(null);
      return;
    }
    setTooltip({
      text: tooltipLabel(incident),
      x: evt.clientX + 14,
      y: evt.clientY + 14,
    });
  };

  return (
    <div
      style={{ width: "100%", background: BG, position: "relative", border: `1px solid ${BORDER}` }}
      onMouseMove={handleMove}
      onMouseLeave={() => setTooltip(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {features.map((feature) => (
          <path
            key={feature.id}
            d={feature.pathD}
            fill={LAND}
            stroke={STROKE}
            strokeWidth="0.65"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {renderedChokepoints.map((point) => (
          <g key={point.name}>
            <rect
              x={point.x}
              y={point.y}
              width={point.rectWidth}
              height={point.rectHeight}
              fill="none"
              stroke={AMBER}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {renderedChokepoints.map((point) => (
          <g key={`${point.name}-pin`}>
            <circle
              cx={point.centerX}
              cy={point.centerY}
              r="6"
              fill={AMBER}
              stroke="hsla(220,20%,7%,0.95)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={point.centerX}
              y={point.centerY + 2}
              textAnchor="middle"
              fill={BG}
              fontSize="8"
              fontWeight="700"
              fontFamily='"JetBrains Mono", monospace'
            >
              {point.index}
            </text>
          </g>
        ))}

        {plottedIncidents.map((incident) => (
          <circle
            key={`${incident.location || "incident"}-${incident.index}`}
            cx={incident.cx}
            cy={incident.cy}
            r={incident.radius}
            fill={incident.fill}
            stroke="hsla(220,20%,7%,0.95)"
            strokeWidth="1"
            data-incident-index={incident.index}
          />
        ))}

        <g transform={`translate(14 ${height - 34})`}>
          <rect x="0" y="-14" width="180" height="24" fill="hsla(220,20%,8%,0.92)" stroke={BORDER} strokeWidth="1" />
          <g transform="translate(12 -2)">
            <circle r="3" fill={AMBER} />
            <text x="9" y="3" fill={DIM} fontSize="9" fontFamily='"JetBrains Mono", monospace'>0 fatalities</text>
          </g>
          <g transform="translate(88 -2)">
            <circle r="3" fill={ORANGE} />
            <text x="9" y="3" fill={DIM} fontSize="9" fontFamily='"JetBrains Mono", monospace'>1-5</text>
          </g>
          <g transform="translate(124 -2)">
            <circle r="3" fill={RED} />
            <text x="9" y="3" fill={DIM} fontSize="9" fontFamily='"JetBrains Mono", monospace'>&gt;5 fatalities</text>
          </g>
        </g>

        {isLoading && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={DIM}
            fontSize="14"
            fontFamily='"JetBrains Mono", monospace'
            letterSpacing="0.08em"
          >
            Loading…
          </text>
        )}
      </svg>

      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "hsla(220,20%,8%,0.96)",
            border: `1px solid ${BORDER}`,
            color: TEXT,
            padding: "8px 10px",
            fontSize: 10,
            fontFamily: '"JetBrains Mono", monospace',
            pointerEvents: "none",
            zIndex: 20,
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            maxWidth: 260,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
