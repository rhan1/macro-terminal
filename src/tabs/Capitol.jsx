import { useState } from "react";
import { useCapitolData } from "../hooks/useCapitolData";
import CapitolTradesTable from "../components/CapitolTradesTable";
import CapitolTopMovers from "../components/CapitolTopMovers";
import CapitolClusterBox from "../components/CapitolClusterBox";
import CapitolCommitteeBox from "../components/CapitolCommitteeBox";
import CapitolSectorFlow from "../components/CapitolSectorFlow";
import CapitolLeaderboard from "../components/CapitolLeaderboard";
import AsOfPill from "../components/AsOfPill";

const GREEN = "hsl(142,70%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

export default function Capitol() {
  const [period, setPeriod] = useState(30);
  const { data, loading } = useCapitolData(period);

  const trades = data?.trades || [];
  const topBuys = data?.topBuys || [];
  const topSells = data?.topSells || [];
  const clusters = data?.clusters || [];
  const committeeAligned = data?.committeeAligned || [];
  const sectorFlow = data?.sectorFlow || [];
  const leaderboard = data?.leaderboard || [];
  const total = data?.meta?.total || 0;
  const latestTradeDate = trades.reduce((latestDate, trade) => {
    const candidate = trade?.tradeDate || null;
    if (!candidate) return latestDate;
    if (!latestDate) return candidate;
    return candidate > latestDate ? candidate : latestDate;
  }, null);

  const hasData = total > 0;
  const cluster7d = clusters.filter((c) => {
    const maxDate = c.politicians?.[0]?.tradeDate;
    if (!maxDate) return false;
    const d = new Date(maxDate).getTime();
    return (Date.now() - d) / 86_400_000 < 7;
  }).length;

  const kpi = {
    filings7d: data?.meta?.filings7d ?? 0,
    netBuy: trades
      .filter((t) => t.side === "buy")
      .reduce((n, t) => n + (t.value || 0), 0),
    netSell: trades
      .filter((t) => t.side === "sell")
      .reduce((n, t) => n + (t.value || 0), 0),
    mostActive: leaderboard[0]?.politician || "—",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 24, color: GREEN, letterSpacing: "0.08em", fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>
          $ CAPITOL
        </div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
          — Congressional Trading & Political Signal · STOCK Act disclosures via CapitolTrades
        </div>
      </div>

      {cluster7d > 0 && (
        <div className="panel" style={{ padding: "10px 14px", borderLeft: `3px solid ${AMBER}` }}>
          <span style={{ color: AMBER, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            ⚠ {cluster7d} clustered ticker{cluster7d > 1 ? "s" : ""} in last 7 days
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Latest filed trade</span>
          <AsOfPill date={latestTradeDate} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label="FILINGS 7D" value={kpi.filings7d} />
        <Kpi label={`NET BUY (${period}D)`} value={`$${(kpi.netBuy / 1_000_000).toFixed(1)}M`} color={GREEN} />
        <Kpi label={`NET SELL (${period}D)`} value={`$${(kpi.netSell / 1_000_000).toFixed(1)}M`} color="hsl(0,72%,55%)" />
        <Kpi label="MOST ACTIVE" value={kpi.mostActive} color={CYAN} small />
        <PeriodToggle period={period} onChange={setPeriod} />
        </div>
      </div>

      {!hasData && !loading && (
        <div className="panel" style={{ padding: "14px 16px", fontSize: 11, color: DIM }}>
          Capitol data not yet seeded. After the next deploy, trigger a refresh via{" "}
          <code style={{ color: CYAN }}>curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/refresh-capitol</code>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CapitolTopMovers title={`TOP BUYS — ${period}D`} items={topBuys} side="buy" />
        <CapitolTopMovers title={`TOP SELLS — ${period}D`} items={topSells} side="sell" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CapitolClusterBox clusters={clusters} />
        <CapitolCommitteeBox items={committeeAligned} />
      </div>

      <CapitolSectorFlow sectorFlow={sectorFlow} />

      <CapitolLeaderboard leaderboard={leaderboard} />

      <CapitolTradesTable trades={trades} />
    </div>
  );
}

function Kpi({ label, value, color, small }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", background: "hsl(220,20%,9%)" }}>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: small ? 12 : 16,
        fontWeight: 600,
        fontFamily: '"JetBrains Mono", monospace',
        color: color || "hsl(220,15%,90%)",
        lineHeight: 1.1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

function PeriodToggle({ period, onChange }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", background: "hsl(220,20%,9%)" }}>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", marginBottom: 4 }}>PERIOD</div>
      <div style={{ display: "flex", gap: 4 }}>
        {[7, 30, 90].map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              background: period === p ? "hsla(185,70%,55%,0.15)" : "transparent",
              border: `1px solid ${period === p ? "hsl(185,70%,55%)" : BORDER}`,
              color: period === p ? "hsl(185,70%,65%)" : DIM,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              padding: "3px 8px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            {p}D
          </button>
        ))}
      </div>
    </div>
  );
}
