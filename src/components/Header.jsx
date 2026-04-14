import { useState, useEffect } from "react";

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = time.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid var(--color-term-border)",
        background: "var(--color-term-surface)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-term-dim)" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        <span className="glow-green" style={{ color: "var(--color-term-green)", fontWeight: 600, fontSize: 11 }}>
          MACRO TERMINAL <span style={{ color: "var(--color-term-dim)", fontWeight: 400 }}>v2.6.0</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--color-term-dim)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        <span>FRED / BLS / BEA / ISM / TREASURY</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-term-green)",
              display: "inline-block",
              animation: "cursor-blink 1s step-end infinite",
            }}
          />
          <span style={{ color: "var(--color-term-text)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            {clock}
          </span>
        </div>
      </div>
    </header>
  );
}
