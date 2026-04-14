import { useState } from "react";
import { formatNum, formatPct } from "../services/fred";

const SIGNAL_STYLES = {
  bullish: {
    bg: "hsla(142,70%,55%,0.08)",
    border: "hsla(142,70%,55%,0.2)",
    text: "hsl(142,70%,55%)",
    glow: "glow-green",
    badge: "hsla(142,70%,55%,0.15)",
  },
  bearish: {
    bg: "hsla(0,72%,55%,0.08)",
    border: "hsla(0,72%,55%,0.2)",
    text: "hsl(0,72%,55%)",
    glow: "glow-red",
    badge: "hsla(0,72%,55%,0.15)",
  },
  neutral: {
    bg: "hsla(45,90%,55%,0.08)",
    border: "hsla(45,90%,55%,0.25)",
    text: "hsl(45,90%,55%)",
    glow: "glow-amber",
    badge: "hsla(45,90%,55%,0.15)",
  },
};

const DIR_ICONS = { up: "▲", down: "▼", flat: "◆" };

function Sparkline({ data, color, width = 48, height = 20 }) {
  if (!data || data.length < 2) return null;
  const vals = data.map((d) => (typeof d === "number" ? d : d.value)).filter((v) => v != null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ display: "block", opacity: 0.7 }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function IndicatorCard({
  label,
  value,
  unit = "",
  change,
  changeLabel,
  direction,
  signal = "neutral",
  detail,
  source,
  sourceUrl,
  decimals = 2,
  prefix = "",
  dateLabel,
  sparkData,
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const s = SIGNAL_STYLES[signal] || SIGNAL_STYLES.neutral;

  const dirIcon = direction ? DIR_ICONS[direction] || "" : "";

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "hsl(220,20%,7%)" : s.bg,
        border: `1px solid ${s.border}`,
        padding: 12,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Top: label+value (left) + badge (right, top-aligned) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(220,10%,40%)", marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className={s.glow}
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: s.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value != null ? `${prefix}${formatNum(value, decimals)}${unit}` : "—"}
            </span>
            {sparkData && <Sparkline data={sparkData} color={s.text} />}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: s.text,
            background: s.badge,
            padding: "2px 6px",
            borderRadius: 2,
          }}
        >
          {signal}
        </div>
      </div>

      {/* Direction + change + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        {dirIcon && (
          <span style={{ fontSize: 9, color: s.text }}>{dirIcon}</span>
        )}
        <span style={{ color: "hsl(220,10%,40%)", fontVariantNumeric: "tabular-nums" }}>
          {changeLabel || (change != null ? formatPct(change) : "")}
        </span>
        {dateLabel && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "hsl(220,10%,40%)" }}>{dateLabel}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && detail && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid hsl(220,15%,14%)",
            fontSize: 11,
            color: "hsl(220,10%,40%)",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0 }}>{detail}</p>
          {source && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "hsl(185,70%,55%)", fontSize: 9 }}>SRC: </span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "hsl(185,70%,55%)", fontSize: 9, textDecoration: "none" }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => { e.target.style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { e.target.style.textDecoration = "none"; }}
                >
                  {source}
                </a>
              ) : (
                <span style={{ color: "hsl(185,70%,55%)", fontSize: 9 }}>{source}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
