const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const PARTY_COLOR = { D: "hsl(220,70%,60%)", R: "hsl(0,70%,60%)", I: DIM };

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default function CapitolLeaderboard({ leaderboard }) {
  const rows = (leaderboard || []).slice(0, 10);
  const maxVol = Math.max(1, ...rows.map((r) => r.volume || 0));

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          YTD Leaderboard
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          top 10 by disclosed volume
        </span>
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: DIM }}>Leaderboard not yet seeded.</div>
      )}
      {rows.map((r, i) => {
        const partyColor = PARTY_COLOR[r.party] || DIM;
        const widthPct = Math.max(1, ((r.volume || 0) / maxVol) * 100);
        return (
          <div key={`${r.politician}-${i}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center" }}>
            <span style={{ width: 18, fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "hsl(220,15%,88%)" }}>{r.politician}</span>
                <span style={{ fontSize: 9, color: partyColor, fontWeight: 700, letterSpacing: "0.06em" }}>
                  {r.party}
                </span>
                <span style={{ fontSize: 9, color: DIM }}>{r.chamber}</span>
              </div>
              <div style={{
                height: 4,
                marginTop: 3,
                background: "hsl(220,20%,9%)",
                border: `1px solid ${BORDER}`,
                position: "relative",
              }}>
                <div style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: CYAN,
                  opacity: 0.7,
                }} />
              </div>
            </div>
            <span style={{ fontSize: 10, color: DIM, textAlign: "right" }}>
              {r.tradeCount || 0}x
            </span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "hsl(220,15%,90%)", textAlign: "right" }}>
              {fmtUsd(r.volume)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
