const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIAMOND = "hsl(200,80%,70%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const PARTY_COLOR = { D: "hsl(220,70%,60%)", R: "hsl(0,70%,60%)", I: DIM };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CapitolCommitteeBox({ items }) {
  const rows = (items || []).slice(0, 10);
  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: DIAMOND, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          💎 Committee-Aligned Trades
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          committee ↔ ticker sector overlap
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: DIM }}>No committee-aligned trades in last 60 days.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((t, i) => {
            const sideColor = t.side === "buy" ? GREEN : RED;
            const partyColor = PARTY_COLOR[t.party] || DIM;
            return (
              <div
                key={`${t.politician}-${t.ticker}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 10,
                  alignItems: "baseline",
                  padding: "5px 8px",
                  fontSize: 11,
                  borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: DIM }}>
                  {fmtDate(t.tradeDate)}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline", overflow: "hidden" }}>
                  <span style={{ color: "hsl(220,15%,88%)", fontSize: 10 }}>
                    {t.politician}
                  </span>
                  <span style={{ fontSize: 9, color: partyColor, fontWeight: 700, letterSpacing: "0.06em" }}>
                    {t.party}
                  </span>
                </div>
                <a
                  href={t.ticker ? `https://finance.yahoo.com/quote/${encodeURIComponent(t.ticker)}` : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: '"JetBrains Mono", monospace', color: CYAN, fontWeight: 600, textDecoration: "none", fontSize: 10 }}
                >
                  {t.ticker || "—"}
                </a>
                <span style={{ fontSize: 10, color: sideColor, fontWeight: 700, letterSpacing: "0.08em" }}>
                  {t.side?.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
