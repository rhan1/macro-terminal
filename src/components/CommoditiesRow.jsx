import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import { COMMODITIES } from "../data/commoditiesList";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const SECTOR_ACCENT = {
  Energy: "hsl(35,80%,55%)",
  Metals: "hsl(50,80%,60%)",
  Agri:   "hsl(140,40%,50%)",
};

function fmtPrice(n) {
  if (n == null) return "—";
  const digits = n < 5 ? 3 : n < 100 ? 2 : n < 1000 ? 2 : 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function CommoditiesRow({ marketData }) {
  return (
    <div className="panel" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
        Commodities
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
        {COMMODITIES.map((c) => {
          const q = marketData?.[c.yahoo];
          const pct = q?.changePct;
          const color = pct == null ? DIM : pct >= 0 ? GREEN : RED;
          const chart = q?.chart || [];
          const accent = SECTOR_ACCENT[c.sector] || DIM;
          return (
            <div
              key={c.yahoo}
              style={{
                background: "hsl(220,20%,9%)",
                border: `1px solid ${BORDER}`,
                borderLeft: `2px solid ${accent}`,
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 10, color: "hsl(220,15%,85%)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 8, color: DIM }}>{c.unit}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: "hsl(220,15%,92%)" }}>
                  {fmtPrice(q?.price)}
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
