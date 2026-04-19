const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default function CapitolTopMovers({ title, items, side = "buy" }) {
  const rows = (items || []).slice(0, 10);
  const barColor = side === "buy" ? GREEN : RED;
  const maxVal = Math.max(1, ...rows.map((r) => r.netDollar || 0));

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
        {title}
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: DIM }}>No data for this period.</div>
      )}
      {rows.map((r) => {
        const widthPct = Math.max(1, ((r.netDollar || 0) / maxVal) * 100);
        return (
          <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 54,
              color: "hsl(220,15%,90%)",
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 600,
              fontSize: 11,
            }}>
              {r.ticker || "—"}
            </span>
            <div style={{ flex: 1, height: 14, background: "hsl(220,20%,9%)", border: `1px solid ${BORDER}`, position: "relative" }}>
              <div style={{
                width: `${widthPct}%`,
                height: "100%",
                background: barColor,
                opacity: 0.75,
                transition: "width 300ms ease",
              }} />
            </div>
            <span style={{
              width: 70,
              textAlign: "right",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: barColor,
            }}>
              {fmtUsd(r.netDollar)}
            </span>
            <span style={{ width: 32, textAlign: "right", fontSize: 9, color: DIM }}>
              {r.tradeCount || r.politicians?.length || 0}×
            </span>
          </div>
        );
      })}
    </div>
  );
}
