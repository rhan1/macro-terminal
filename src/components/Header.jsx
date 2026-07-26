import { useState, useEffect } from "react";
import { version } from "../../package.json";

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

  const dateStr = time.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid hsl(220,15%,14%)",
        background: "hsl(220,20%,3%)",
        flexShrink: 0,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 16, fontWeight: 700, color: "hsl(142,70%,55%)",
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: "-0.05em",
            display: "inline-flex", alignItems: "center",
          }}>
            &gt;_<span className="blink-cursor" style={{
              display: "inline-block", width: 8, height: 14,
              background: "hsl(142,70%,55%)", marginLeft: 1,
            }} />
          </span>
          <span className="glow-green" style={{ fontSize: 14, fontWeight: 600, color: "hsl(142,70%,55%)", letterSpacing: "0.05em" }}>
            MACRO SIGNAL
          </span>
          <span style={{ fontSize: 10, color: "hsl(220,10%,52%)", marginLeft: -4 }}>v{version}</span>
        </div>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span className="header-sources" style={{ fontSize: 10, color: "hsl(220,10%,52%)", letterSpacing: "0.05em" }}>
          FRED / BLS / BEA / ISM / TREASURY
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "hsl(220,10%,52%)" }}>{dateStr}</span>
          <span
            className="glow-green"
            style={{ fontSize: 12, color: "hsl(142,70%,55%)", fontVariantNumeric: "tabular-nums" }}
          >
            {clock}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "hsl(142,70%,55%)",
              display: "inline-block",
              animation: "cursor-blink 1s step-end infinite",
            }}
          />
        </div>
      </div>
    </header>
  );
}
