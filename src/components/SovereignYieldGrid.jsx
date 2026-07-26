const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtYield(n) {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function fmtBps(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${Math.round(n)}bps`;
}

export default function SovereignYieldGrid({ yields, stress }) {
  const allSorted = (yields || []).slice().sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const hasAnyValue = allSorted.some((y) => y.value != null);
  const list = hasAnyValue ? allSorted.filter((y) => y.value != null) : allSorted;

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Sovereign 10Y Yields
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          FRED (US daily · others monthly) · CN via EastMoney
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
        {list.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: DIM }}>
            Yield data not yet seeded.
          </div>
        )}
        {list.map((y) => {
          const deltaColor = y.dailyChange == null ? DIM : y.dailyChange >= 0 ? RED : GREEN;
          return (
            <div
              key={y.countryCode}
              style={{
                background: "hsl(220,20%,9%)",
                border: `1px solid ${BORDER}`,
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div style={{ fontSize: 10, color: "hsl(220,15%,85%)", fontWeight: 600, letterSpacing: "0.04em" }}>
                {y.flag} {y.country}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: "hsl(220,15%,92%)" }}>
                  {fmtYield(y.value)}
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: deltaColor }}>
                  {y.dailyChange != null ? `${y.dailyChange >= 0 ? "+" : ""}${y.dailyChange.toFixed(2)}` : ""}
                </span>
              </div>
              {y.spreadUs != null && (
                <div style={{ fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
                  vs UST: {fmtBps(y.spreadUs)}
                </div>
              )}
              <div style={{ fontSize: 8, color: "hsl(220,10%,38%)", letterSpacing: "0.04em" }}>
                {y.source || "—"}
                {y.asOf
                  ? ` · as of ${/monthly/i.test(y.source || "") ? y.asOf.slice(0, 7) : y.asOf}`
                  : ""}
              </div>
            </div>
          );
        })}
      </div>

      {(stress?.bundMinusUst != null || stress?.btpMinusBund != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em" }}>STRESS SIGNALS:</span>
          {stress?.bundMinusUst != null && (
            <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: stress.bundMinusUst < 0 ? AMBER : CYAN }}>
              Bund − UST {fmtBps(stress.bundMinusUst)}
            </span>
          )}
          {stress?.btpMinusBund != null && (
            <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: stress.btpMinusBund > 200 ? RED : CYAN }}>
              BTP − Bund {fmtBps(stress.btpMinusBund)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
