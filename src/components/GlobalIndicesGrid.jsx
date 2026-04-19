import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import worldIndices from "../data/worldIndices.json";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const REGION_ACCENT = {
  "Americas": "hsl(215,70%,60%)",
  "Europe": "hsl(75,70%,55%)",
  "Asia-Pacific": "hsl(335,70%,60%)",
};

function fmtPrice(n, currency) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 10000 ? 0 : abs >= 100 ? 2 : abs >= 10 ? 2 : 4;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function weekPct(chart) {
  if (!Array.isArray(chart) || chart.length < 6) return null;
  const latest = chart[chart.length - 1]?.close;
  const weekAgo = chart[Math.max(0, chart.length - 6)]?.close;
  if (!latest || !weekAgo) return null;
  return ((latest / weekAgo) - 1) * 100;
}

function ytdPct(chart) {
  if (!Array.isArray(chart) || chart.length < 2) return null;
  const latest = chart[chart.length - 1]?.close;
  const thisYear = new Date().getFullYear();
  const first = chart.find((pt) => new Date(pt.date).getFullYear() === thisYear)?.close;
  if (!latest || !first) return null;
  return ((latest / first) - 1) * 100;
}

function IndexCard({ meta, quote }) {
  const pct = quote?.changePct;
  const chart = quote?.chart || [];
  const weekly = weekPct(chart);
  const ytd = ytdPct(chart);
  const accent = REGION_ACCENT[meta.region] || DIM;
  const pctColor = pct == null ? DIM : pct >= 0 ? GREEN : RED;
  const sparkColor = pct == null ? DIM : pct >= 0 ? GREEN : RED;
  return (
    <div
      style={{
        background: "hsl(220,20%,9%)",
        border: `1px solid ${BORDER}`,
        borderLeft: `2px solid ${accent}`,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 10, color: "hsl(220,15%,85%)", fontWeight: 600, letterSpacing: "0.03em" }}>
          {meta.flag} {meta.name}
        </span>
        <span style={{ fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
          {meta.currency}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: "hsl(220,15%,92%)" }}>
          {fmtPrice(quote?.price, meta.currency)}
        </span>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: pctColor }}>
          {fmtPct(pct)}
        </span>
      </div>
      {(weekly != null || ytd != null) && (
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
          {weekly != null && <span>1W {fmtPct(weekly)}</span>}
          {ytd != null && <span>YTD {fmtPct(ytd)}</span>}
        </div>
      )}
      <div style={{ height: 22, marginTop: 2 }}>
        {chart.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line type="monotone" dataKey="close" stroke={sparkColor} strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function GlobalIndicesGrid({ marketData }) {
  const byRegion = {};
  for (const idx of worldIndices) {
    (byRegion[idx.region] ||= []).push(idx);
  }

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
        World Equity Indices
      </div>
      {["Americas", "Europe", "Asia-Pacific"].map((region) => (
        <div key={region}>
          <div style={{ fontSize: 9, color: REGION_ACCENT[region], letterSpacing: "0.1em", marginBottom: 6, fontWeight: 600 }}>
            {region.toUpperCase()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
            {(byRegion[region] || []).map((meta) => (
              <IndexCard key={meta.symbol} meta={meta} quote={marketData?.[meta.symbol]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
