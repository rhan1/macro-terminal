import { useState, useEffect } from "react";

export default function Footer() {
  const [refreshTime] = useState(() => new Date());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - refreshTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [refreshTime]);

  const fmt = elapsed < 60
    ? `${elapsed}s ago`
    : elapsed < 3600
    ? `${Math.floor(elapsed / 60)}m ago`
    : `${Math.floor(elapsed / 3600)}h ago`;

  return (
    <div
      style={{
        marginTop: 24,
        paddingBottom: 12,
        paddingTop: 12,
        borderTop: "1px solid hsl(220,15%,14%)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 10,
        color: "hsl(220,10%,52%)",
        letterSpacing: "0.04em",
      }}
    >
      <span>MACRO SIGNAL &middot; FRED &middot; Yahoo Finance &middot; ApeWisdom &middot; FearGreedChart &middot; MortgageNewsDaily &middot; Nasdaq &middot; SEC EDGAR &middot; Google Trends &middot; TreasuryDirect &middot; Kalshi</span>
      <span style={{ fontSize: 9, color: "hsl(220,10%,38%)" }}>
        Sampled from Perplexity &mdash; Built upon by Kaza Rhan
      </span>
      <span>
        DATA REFRESHED:{" "}
        <span style={{ color: "hsl(142,70%,55%)" }}>{fmt}</span>
      </span>
    </div>
  );
}
