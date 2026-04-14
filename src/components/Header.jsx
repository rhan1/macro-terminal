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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", opacity: 0.8, display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308", opacity: 0.8, display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", opacity: 0.8, display: "inline-block" }} />
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(220,10%,40%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
        </svg>
        <span className="glow-green" style={{ fontSize: 14, fontWeight: 600, color: "hsl(142,70%,55%)", letterSpacing: "0.08em" }}>
          MACRO TERMINAL
        </span>
        <span style={{ fontSize: 10, color: "hsl(220,10%,40%)" }}>v2.6.0</span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 10, color: "hsl(220,10%,40%)", letterSpacing: "0.08em" }}>
          FRED / BLS / BEA / ISM / TREASURY
        </span>
        <span style={{ fontSize: 12, color: "hsl(220,10%,40%)" }}>{dateStr}</span>
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
    </header>
  );
}
