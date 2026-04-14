import { useState } from "react";
import { formatNum, formatPct } from "../services/fred";

export default function IndicatorCard({
  label,
  value,
  unit = "",
  change,
  detail,
  source,
  sourceUrl,
  decimals = 2,
}) {
  const [expanded, setExpanded] = useState(false);

  const changeColor =
    change == null
      ? "var(--color-term-dim)"
      : change > 0
      ? "var(--color-term-green)"
      : change < 0
      ? "var(--color-term-red)"
      : "var(--color-term-amber)";

  const changeGlow =
    change == null
      ? ""
      : change > 0
      ? "glow-green"
      : change < 0
      ? "glow-red"
      : "glow-amber";

  return (
    <div className="indicator-card" onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--color-term-dim)",
              marginBottom: 4,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-term-text)" }}>
            {value != null ? `${formatNum(value, decimals)}${unit}` : "—"}
          </div>
        </div>
        {change != null && (
          <span className={changeGlow} style={{ color: changeColor, fontSize: 11, fontWeight: 500 }}>
            {formatPct(change)}
          </span>
        )}
      </div>

      {expanded && detail && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--color-term-border)",
            fontSize: 10,
            color: "var(--color-term-dim)",
            lineHeight: 1.6,
            textAlign: "left",
          }}
        >
          <p>{detail}</p>
          {source && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>SRC: </span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--color-term-cyan)", fontSize: 9, textDecoration: "none" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {source}
                </a>
              ) : (
                <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>{source}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
