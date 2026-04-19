const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default function CapitolClusterBox({ clusters }) {
  const rows = (clusters || []).slice(0, 10);
  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Cluster Alerts
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          ≥3 politicians · 14d · 70% directional
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: DIM }}>No clusters detected in last 14 days.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((c) => {
            const color = c.direction === "buy" ? GREEN : RED;
            return (
              <div
                key={c.ticker}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 8px",
                  background: "hsl(220,20%,9%)",
                  border: `1px solid ${BORDER}`,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: CYAN, fontSize: 12 }}>
                  {c.ticker}
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 10, color: "hsl(220,15%,88%)" }}>
                    {c.issuer || "—"}
                  </span>
                  <span style={{ fontSize: 9, color: DIM }}>
                    {c.politicianCount}× {c.direction?.toUpperCase()} · {c.tradeCount || "?"} trades
                    {c.bipartisan && (
                      <span style={{ color: AMBER, marginLeft: 6, letterSpacing: "0.06em" }}>BIPARTISAN</span>
                    )}
                  </span>
                </div>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color }}>
                  {fmtUsd(c.netDollar)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
