const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function barColor(net) {
  if (net == null || !isFinite(net) || Math.abs(net) < 1) return "hsl(220,10%,45%)";
  const mag = Math.min(Math.abs(net) / 5_000_000, 1);
  const lightness = 40 + mag * 20;
  if (net > 0) return `hsl(142,70%,${lightness}%)`;
  return `hsl(0,72%,${lightness}%)`;
}

function barHeight(net, maxAbs) {
  if (!maxAbs) return 0;
  return Math.min(Math.abs(net) / maxAbs, 1);
}

export default function CapitolSectorFlow({ sectorFlow }) {
  const list = sectorFlow && sectorFlow.length ? sectorFlow : [];
  const sorted = list.slice().sort((a, b) => Math.abs(b.netDollar || 0) - Math.abs(a.netDollar || 0));
  const maxAbs = Math.max(1, ...sorted.map((s) => Math.abs(s.netDollar || 0)));

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Sector Net Flow — 90d
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          size-bracket midpoint · net $ by sector
        </span>
      </div>

      {sorted.length === 0 ? (
        <div style={{ fontSize: 11, color: DIM }}>Sector flow not yet seeded.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 4 }}>
          {sorted.map((s) => {
            const barH = barHeight(s.netDollar, maxAbs);
            const color = barColor(s.netDollar);
            return (
              <div
                key={s.sector}
                style={{
                  position: "relative",
                  background: "hsl(220,20%,9%)",
                  padding: "10px 8px 10px 14px",
                  border: `1px solid ${BORDER}`,
                  overflow: "hidden",
                }}
              >
                <div style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: 4,
                  height: `${barH * 100}%`,
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                  transition: "height 300ms ease",
                }} />
                <div style={{ fontSize: 9, color: "hsl(220,15%,82%)", letterSpacing: "0.06em", marginBottom: 2 }}>
                  {s.sector}
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: s.netDollar >= 0 ? GREEN : RED,
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  {fmtUsd(s.netDollar)}
                </div>
                <div style={{ fontSize: 8, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.tradeCount || 0} trades
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
