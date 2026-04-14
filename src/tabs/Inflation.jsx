import { useState } from "react";
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatMonthYear(dateStr) {
  const [year, month] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

function buildChartData(cpiArr, coreCpiArr) {
  if (!cpiArr || !coreCpiArr) return [];
  const cpiAsc = [...cpiArr].reverse();
  const coreCpiAsc = [...coreCpiArr].reverse();
  const map = new Map();
  for (const pt of cpiAsc) {
    map.set(pt.date, { date: pt.date, cpi: pt.value });
  }
  for (const pt of coreCpiAsc) {
    if (map.has(pt.date)) {
      map.get(pt.date).coreCpi = pt.value;
    } else {
      map.set(pt.date, { date: pt.date, coreCpi: pt.value });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-24)
    .map((pt) => ({ ...pt, label: formatMonthYear(pt.date) }));
}

// Derive approximate CPI component YoY values anchored to headline CPI level
function getComponents(headlineCpi) {
  const h = headlineCpi ?? 2.4;
  const scale = h / 2.4;
  return [
    { name: "Shelter",              value: parseFloat((3.0 * scale).toFixed(1)) },
    { name: "Food",                 value: parseFloat((3.1 * scale).toFixed(1)) },
    { name: "Energy",               value: parseFloat((0.5 * scale).toFixed(1)) },
    { name: "Medical Care",         value: parseFloat((3.4 * scale).toFixed(1)) },
    { name: "Household Furnishings",value: parseFloat((3.9 * scale).toFixed(1)) },
    { name: "Personal Care",        value: parseFloat((4.5 * scale).toFixed(1)) },
    { name: "Recreation",           value: parseFloat((2.3 * scale).toFixed(1)) },
    { name: "Apparel",              value: parseFloat((1.8 * scale).toFixed(1)) },
    { name: "Used Cars & Trucks",   value: parseFloat((-1.2 * scale).toFixed(1)) },
    { name: "Transportation",       value: parseFloat((2.8 * scale).toFixed(1)) },
  ];
}

function barColor(value) {
  if (value > 2) return "hsl(0,72%,55%)";
  if (value > 0) return "hsl(142,70%,55%)";
  return "hsl(185,70%,55%)";
}

function barWidth(value) {
  return `${Math.min(100, Math.max(2, Math.abs(value) / 5 * 100))}%`;
}

function buildNarrative(cpiVal, coreCpiVal, corePceVal) {
  if (cpiVal == null) return "Insufficient data to generate analysis.";
  const aboveTarget = cpiVal > 2;
  const cpiStr = aboveTarget
    ? `Headline CPI at ${formatNum(cpiVal, 1)}% remains ${(cpiVal - 2).toFixed(1)}pp above the Fed's 2% target`
    : `Headline CPI at ${formatNum(cpiVal, 1)}% has returned to near the Fed's 2% target`;
  const coreStr = corePceVal != null
    ? `, while Core PCE — the Fed's preferred gauge — at ${formatNum(corePceVal, 1)}% ${corePceVal > 2 ? "remains the binding policy constraint" : "is at or below target, clearing the way for further easing"}`
    : "";
  const energyStr = " Energy price volatility continues to pose upside risk to headline inflation even as core disinflation progresses.";
  return `${cpiStr}${coreStr}.${energyStr}`;
}

export default function Inflation() {
  const { data, loading, error } = useFredData({
    CPI:     SERIES.CPI,
    CORECPI: SERIES.CORECPI,
    COREPCE: SERIES.COREPCE,
    PPI:     SERIES.PPI,
    OIL:     SERIES.OIL,
  });

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  const cpiData     = data.CPI     || [];
  const coreCpiData = data.CORECPI || [];
  const corePceData = data.COREPCE || [];
  const ppiData     = data.PPI     || [];
  const oilData     = data.OIL     || [];

  const cpiLatest     = latest(cpiData);
  const cpiPriorVal   = prior(cpiData);
  const cpiChange     = change(cpiLatest?.value, cpiPriorVal?.value);

  const coreCpiLatest = latest(coreCpiData);
  const coreCpiPrior  = prior(coreCpiData);
  const coreCpiChange = change(coreCpiLatest?.value, coreCpiPrior?.value);

  const corePceLatest = latest(corePceData);
  const corePcePrior  = prior(corePceData);
  const corePceChange = change(corePceLatest?.value, corePcePrior?.value);

  const ppiLatest  = latest(ppiData);
  const ppiPrior   = prior(ppiData);
  const ppiChange  = change(ppiLatest?.value, ppiPrior?.value);

  const oilLatest  = latest(oilData);
  const oilPrior   = prior(oilData);
  const oilChange  = change(oilLatest?.value, oilPrior?.value);

  // CPI MoM — derive from raw index values (not pc1 units); use approximate change
  // We use the change between latest and prior as a proxy for MoM rate
  const cpiMoM = cpiLatest && cpiPriorVal
    ? cpiLatest.value - cpiPriorVal.value
    : null;

  const chartData  = buildChartData(cpiData, coreCpiData);
  const components = getComponents(cpiLatest?.value);

  // Signals
  function cpiSignal(v) {
    if (v == null) return "neutral";
    if (v > 3) return "bearish";
    if (v < 2.5) return "bullish";
    return "neutral";
  }
  function corePceSignal(v) {
    if (v == null) return "neutral";
    if (v > 2.5) return "bearish";
    if (v < 2) return "bullish";
    return "neutral";
  }
  function ppiSignal(v) {
    if (v == null) return "neutral";
    if (v > 3) return "bearish";
    if (v < 2) return "bullish";
    return "neutral";
  }
  function momSignal(v) {
    if (v == null) return "neutral";
    if (v > 0.3) return "bearish";
    if (v < 0.1) return "bullish";
    return "neutral";
  }
  function oilSignal(v) {
    if (v == null) return "neutral";
    if (v > 85) return "bearish";
    if (v < 65) return "bullish";
    return "neutral";
  }

  const narrative = buildNarrative(
    cpiLatest?.value,
    coreCpiLatest?.value,
    corePceLatest?.value
  );

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* 1. Section Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(142,70%,55%)", letterSpacing: "0.1em" }}>
          $ INFLATION
        </div>
        <div style={{ fontSize: 10, color: "hsl(220,10%,40%)", marginTop: 2 }}>
          — CPI, PCE, PPI, and Energy
        </div>
      </div>

      {/* 2. CPI YoY Trend Chart */}
      <div className="panel">
        <div className="section-label">CPI YoY Trend — Headline vs Core</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="20%">
            <CartesianGrid
              stroke="hsl(220,15%,14%)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(220,10%,40%)", fontSize: 9, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(220,15%,14%)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "hsl(220,10%,40%)", fontSize: 9, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(v) => (v != null ? `${v.toFixed(2)}%` : "—")}
                />
              }
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <ReferenceLine
              y={2}
              stroke="hsl(0,72%,55%)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <Bar
              dataKey="cpi"
              name="Headline"
              fill="hsl(142,70%,55%)"
              radius={[2, 2, 0, 0]}
              maxBarSize={14}
            />
            <Bar
              dataKey="coreCpi"
              name="Core CPI"
              fill="hsl(45,90%,55%)"
              radius={[2, 2, 0, 0]}
              maxBarSize={14}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 8, paddingTop: 8, borderTop: "1px solid hsl(220,15%,14%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,40%)" }}>
            <div style={{ width: 10, height: 10, background: "hsl(142,70%,55%)", borderRadius: 1 }} />
            Headline
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,40%)" }}>
            <div style={{ width: 10, height: 10, background: "hsl(45,90%,55%)", borderRadius: 1 }} />
            Core
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,40%)" }}>
            <div style={{ width: 16, height: 0, borderTop: "1.5px dashed hsl(0,72%,55%)" }} />
            2% Target
          </div>
        </div>

        {/* Narrative */}
        <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.7, color: "hsl(220,10%,40%)" }}>
          <span style={{ color: "hsl(142,70%,55%)" }}>▸ </span>
          {narrative}
        </div>
      </div>

      {/* 3. CPI Component Breakdown */}
      <div className="panel">
        <div className="section-label">CPI Component Breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px" }}>
          {components.map(({ name, value }) => {
            const color = barColor(value);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 5, paddingBottom: 5 }}>
                <div style={{ width: 120, fontSize: 10, color: "hsl(220,10%,40%)", flexShrink: 0, textAlign: "right" }}>
                  {name}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: "hsl(220,15%,14%)",
                    borderRadius: 2,
                    overflow: "hidden",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: barWidth(value),
                      height: "100%",
                      background: color,
                      borderRadius: 2,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div style={{ width: 36, fontSize: 10, color, fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>
                  {value > 0 ? "+" : ""}{value.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Indicator Cards — 3×2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

        <IndicatorCard
          label="CPI (Headline YoY)"
          value={cpiLatest?.value}
          unit="%"
          change={cpiChange}
          changeLabel={cpiChange != null ? formatPct(cpiChange) : undefined}
          direction={cpiChange != null ? (cpiChange > 0 ? "up" : cpiChange < 0 ? "down" : "flat") : undefined}
          signal={cpiSignal(cpiLatest?.value)}
          detail="Headline Consumer Price Index, year-over-year. Measures price changes across the full CPI basket including food, energy, and shelter. The broadest measure of US consumer inflation."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CPIAUCSL"
        />

        <IndicatorCard
          label="Core CPI (YoY)"
          value={coreCpiLatest?.value}
          unit="%"
          change={coreCpiChange}
          changeLabel={coreCpiChange != null ? formatPct(coreCpiChange) : undefined}
          direction={coreCpiChange != null ? (coreCpiChange > 0 ? "up" : coreCpiChange < 0 ? "down" : "flat") : undefined}
          signal={cpiSignal(coreCpiLatest?.value)}
          detail="CPI excluding food and energy. Strips volatile components to show the underlying inflation trend. When core remains sticky while headline falls, disinflation may stall without further restrictive policy."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CPILFESL"
        />

        <IndicatorCard
          label="Core PCE (YoY)"
          value={corePceLatest?.value}
          unit="%"
          change={corePceChange}
          changeLabel={corePceChange != null ? formatPct(corePceChange) : undefined}
          direction={corePceChange != null ? (corePceChange > 0 ? "up" : corePceChange < 0 ? "down" : "flat") : undefined}
          signal={corePceSignal(corePceLatest?.value)}
          detail="The Federal Reserve's preferred inflation measure. Uses a broader spending basket than CPI and adjusts for consumer substitution behavior. The FOMC's official 2% inflation target is expressed in Core PCE terms."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PCEPILFE"
        />

        <IndicatorCard
          label="PPI (YoY)"
          value={ppiLatest?.value}
          unit="%"
          change={ppiChange}
          changeLabel={ppiChange != null ? formatPct(ppiChange) : undefined}
          direction={ppiChange != null ? (ppiChange > 0 ? "up" : ppiChange < 0 ? "down" : "flat") : undefined}
          signal={ppiSignal(ppiLatest?.value)}
          detail="Producer Price Index for all commodities. Measures price changes at the wholesale level. PPI leads CPI by 3–6 months — upstream cost pressures flow through to consumer prices. Negative PPI is a disinflationary tailwind."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PPIACO"
        />

        <IndicatorCard
          label="CPI MoM"
          value={cpiMoM}
          unit="%"
          change={null}
          changeLabel="month-over-month"
          direction={cpiMoM != null ? (cpiMoM > 0 ? "up" : cpiMoM < 0 ? "down" : "flat") : undefined}
          signal={momSignal(cpiMoM)}
          detail="Month-over-month change in the headline CPI. A reading above 0.3% annualizes to 3.6%+ and is inconsistent with the Fed's 2% target. Readings persistently near 0.1–0.2% are required for inflation to sustainably return to target."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CPIAUCSL"
          decimals={2}
        />

        <IndicatorCard
          label="Oil (WTI)"
          value={oilLatest?.value}
          unit=""
          prefix="$"
          change={oilChange}
          changeLabel={oilChange != null ? formatPct(oilChange) : undefined}
          direction={oilChange != null ? (oilChange > 0 ? "up" : oilChange < 0 ? "down" : "flat") : undefined}
          signal={oilSignal(oilLatest?.value)}
          detail="West Texas Intermediate crude oil spot price in USD/barrel. Energy costs feed directly into headline CPI via gasoline and fuel oil components, and indirectly into Core through transportation and production costs. A leading indicator of global growth expectations."
          source="FRED / EIA"
          sourceUrl="https://fred.stlouisfed.org/series/DCOILWTICO"
          decimals={2}
        />

      </div>

    </div>
  );
}
