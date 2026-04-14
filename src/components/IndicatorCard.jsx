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
}) {
  const [expanded, setExpanded] = useState(false);
  const s = SIGNAL_STYLES[signal] || SIGNAL_STYLES.neutral;

  const dirIcon = direction ? DIR_ICONS[direction] || "" : "";
  const dirColor =
    direction === "up"
      ? "hsl(142,70%,55%)"
      : direction === "down"
      ? "hsl(0,72%,55%)"
      : "hsl(45,90%,55%)";

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 4,
        padding: 12,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Top row: label + signal badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(220,10%,40%)" }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: s.text,
            background: s.badge,
            padding: "1px 6px",
            borderRadius: 2,
          }}
        >
          {signal}
        </div>
      </div>

      {/* Value */}
      <div
        className={s.glow}
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: s.text,
          fontVariantNumeric: "tabular-nums",
          marginBottom: 4,
        }}
      >
        {value != null ? `${prefix}${formatNum(value, decimals)}${unit}` : "—"}
      </div>

      {/* Direction + change */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {dirIcon && (
            <span style={{ fontSize: 9, color: dirColor }}>{dirIcon}</span>
          )}
          <span style={{ fontSize: 10, color: "hsl(220,10%,40%)", fontVariantNumeric: "tabular-nums" }}>
            {changeLabel || (change != null ? formatPct(change) : "")}
          </span>
        </div>
        {dateLabel && (
          <span style={{ fontSize: 10, color: "hsl(220,10%,40%)" }}>{dateLabel}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && detail && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid hsla(220,15%,14%,0.5)",
            fontSize: 11,
            color: "hsl(220,10%,40%)",
            lineHeight: 1.6,
          }}
        >
          <p>{detail}</p>
          {source && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "hsl(185,70%,55%)", fontSize: 10 }}>SRC: </span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "hsl(185,70%,55%)", fontSize: 10, textDecoration: "none" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {source}
                </a>
              ) : (
                <span style={{ color: "hsl(185,70%,55%)", fontSize: 10 }}>{source}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
