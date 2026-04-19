import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import { FX_PAIRS } from "../data/fxPairs";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtPrice(n, isIndex) {
  if (n == null) return "—";
  const digits = isIndex ? 2 : n < 5 ? 4 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function FxMatrix({ marketData }) {
  return (
    <div className="panel" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
        FX & Dollar
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
        {FX_PAIRS.map((p) => {
          const q = marketData?.[p.yahoo];
          const pct = q?.changePct;
          const color = pct == null ? DIM : pct >= 0 ? GREEN : RED;
          const chart = q?.chart || [];
          return (
            <div
              key={p.yahoo}
              style={{
                background: "hsl(220,20%,9%)",
                border: `1px solid ${BORDER}`,
                borderLeft: p.isIndex ? `2px solid ${AMBER}` : `2px solid ${DIM}`,
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 10, color: "hsl(220,15%,85%)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  {p.flag} {p.display}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: "hsl(220,15%,92%)" }}>
                  {fmtPrice(q?.price, p.isIndex)}
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color }}>
                  {fmtPct(pct)}
                </span>
              </div>
              <div style={{ height: 18 }}>
                {chart.length > 1 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Line type="monotone" dataKey="close" stroke={color} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
