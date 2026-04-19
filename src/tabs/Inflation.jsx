import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, diff, formatNum, formatPct, formatPP } from "../services/fred";
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

function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTH_NAMES[mi]} ${y}` : `${MONTH_NAMES[mi]} ${parseInt(d, 10)}, ${y}`;
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

function getComponentsFromData(data) {
  const components = [
    { name: "Shelter",            key: "CPI_SHELTER" },
    { name: "Food",               key: "CPI_FOOD" },
    { name: "Energy",             key: "CPI_ENERGY" },
    { name: "Medical Care",       key: "CPI_MEDICAL" },
    { name: "Apparel",            key: "CPI_APPAREL" },
    { name: "Transportation",     key: "CPI_TRANSPORT" },
    { name: "Recreation",         key: "CPI_RECREATION" },
    { name: "Used Cars & Trucks", key: "CPI_USED_CARS" },
  ];
  return components.map(({ name, key }) => {
    const val = latest(data[key])?.value;
    return { name, value: val != null ? parseFloat(val.toFixed(1)) : null };
  }).filter(c => c.value != null);
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
  const coreStr = corePceVal != null
    ? `Core PCE — the Fed's preferred gauge — at ${formatNum(corePceVal, 1)}% ${corePceVal > 2 ? "remains the binding policy constraint" : "is at or below target, clearing the way for further easing"}.`
    : `Headline CPI at ${formatNum(cpiVal, 1)}% sits ${Math.abs(cpiVal - 2).toFixed(1)}pp ${cpiVal > 2 ? "above" : "below"} the Fed's 2% target.`;
  const energyStr = " Energy price volatility continues to pose upside risk to headline inflation even as core disinflation progresses.";
  return `${coreStr}${energyStr}`;
}

export default function Inflation() {
  const { data, loading, error } = useFredData({
    CPI:     SERIES.CPI,
    CORECPI: SERIES.CORECPI,
    COREPCE: SERIES.COREPCE,
    PPI:     SERIES.PPI,
    OIL:     SERIES.OIL,
    CPI_SHELTER:    SERIES.CPI_SHELTER,
    CPI_FOOD:       SERIES.CPI_FOOD,
    CPI_ENERGY:     SERIES.CPI_ENERGY,
    CPI_MEDICAL:    SERIES.CPI_MEDICAL,
    CPI_APPAREL:    SERIES.CPI_APPAREL,
    CPI_TRANSPORT:  SERIES.CPI_TRANSPORT,
    CPI_RECREATION: SERIES.CPI_RECREATION,
    CPI_USED_CARS:  SERIES.CPI_USED_CARS,
    BREAKEVEN:      SERIES.BREAKEVEN,
  });

  if (loading && Object.keys(data).length === 0) return <Loading />;

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
  const cpiChange     = diff(cpiLatest?.value, cpiPriorVal?.value);

  const coreCpiLatest = latest(coreCpiData);
  const coreCpiPrior  = prior(coreCpiData);
  const coreCpiChange = diff(coreCpiLatest?.value, coreCpiPrior?.value);

  const corePceLatest = latest(corePceData);
  const corePcePrior  = prior(corePceData);
  const corePceChange = diff(corePceLatest?.value, corePcePrior?.value);

  const ppiLatest  = latest(ppiData);
  const ppiPrior   = prior(ppiData);
  const ppiChange  = diff(ppiLatest?.value, ppiPrior?.value);

  const oilLatest  = latest(oilData);
  const oilPrior   = prior(oilData);
  const oilChange  = change(oilLatest?.value, oilPrior?.value);

  const breakevenData = data.BREAKEVEN || [];
  const breakevenLatest = latest(breakevenData);
  const breakevenPrior = prior(breakevenData);
  const breakevenChange = diff(breakevenLatest?.value, breakevenPrior?.value);

  const chartData  = buildChartData(cpiData, coreCpiData);
  const components = getComponentsFromData(data);

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
        <div style={{ fontSize: 10, color: "hsl(220,10%,52%)", marginTop: 2 }}>
          — CPI, PCE, PPI, and Energy
        </div>
      </div>

      {/* 2. CPI YoY Trend Chart */}
      <div className="panel">
        <div className="section-label">CPI YoY Trend — Headline vs Core</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="12%">
            <CartesianGrid
              stroke="hsl(220,15%,14%)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(220,10%,52%)", fontSize: 9, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(220,15%,14%)" }}
              interval={0}
            />
            <YAxis
              tick={{ fill: "hsl(220,10%,52%)", fontSize: 9, fontFamily: "inherit" }}
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
              maxBarSize={24}
            />
            <Bar
              dataKey="coreCpi"
              name="Core CPI"
              fill="hsl(45,90%,55%)"
              radius={[2, 2, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 8, paddingTop: 8, borderTop: "1px solid hsl(220,15%,14%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,52%)" }}>
            <div style={{ width: 10, height: 10, background: "hsl(142,70%,55%)", borderRadius: 1 }} />
            Headline
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,52%)" }}>
            <div style={{ width: 10, height: 10, background: "hsl(45,90%,55%)", borderRadius: 1 }} />
            Core
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "hsl(220,10%,52%)" }}>
            <div style={{ width: 16, height: 0, borderTop: "1.5px dashed hsl(0,72%,55%)" }} />
            2% Target
          </div>
        </div>

        {/* Narrative */}
        <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.7, color: "hsl(220,10%,52%)" }}>
          <span style={{ color: "hsl(142,70%,55%)" }}>▸ </span>
          {narrative}
        </div>
      </div>

      {/* 3. CPI Component Breakdown */}
      <div className="panel">
        <div className="section-label">CPI Component Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {components.map(({ name, value }) => {
            const color = barColor(value);
            return (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 36px", alignItems: "center", gap: 8, paddingTop: 5, paddingBottom: 5 }}>
                <div style={{ width: 120, fontSize: 10, color: "hsl(220,10%,52%)", flexShrink: 0, textAlign: "right" }}>
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
      <div className="grid-3">

        <IndicatorCard
          label="CPI (Headline YoY)"
          value={cpiLatest?.value}
          unit="%"
          change={cpiChange}
          changeLabel={cpiChange != null ? formatPP(cpiChange) : undefined}
          direction={cpiChange != null ? (cpiChange > 0 ? "up" : cpiChange < 0 ? "down" : "flat") : undefined}
          signal={cpiSignal(cpiLatest?.value)}
          detail="Headline Consumer Price Index, year-over-year. Measures price changes across the full CPI basket including food, energy, and shelter. The broadest measure of US consumer inflation."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CPIAUCSL"
          dateLabel={fmtCardDate(latest(cpiData)?.date)}
          sparkData={cpiData?.slice(0, 12)}
        />

        <IndicatorCard
          label="Core CPI (YoY)"
          value={coreCpiLatest?.value}
          unit="%"
          change={coreCpiChange}
          changeLabel={coreCpiChange != null ? formatPP(coreCpiChange) : undefined}
          direction={coreCpiChange != null ? (coreCpiChange > 0 ? "up" : coreCpiChange < 0 ? "down" : "flat") : undefined}
          signal={cpiSignal(coreCpiLatest?.value)}
          detail="CPI excluding food and energy. Strips volatile components to show the underlying inflation trend. When core remains sticky while headline falls, disinflation may stall without further restrictive policy."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CPILFESL"
          dateLabel={fmtCardDate(latest(coreCpiData)?.date)}
          sparkData={coreCpiData?.slice(0, 12)}
        />

        <IndicatorCard
          label="Core PCE (YoY)"
          value={corePceLatest?.value}
          unit="%"
          change={corePceChange}
          changeLabel={corePceChange != null ? formatPP(corePceChange) : undefined}
          direction={corePceChange != null ? (corePceChange > 0 ? "up" : corePceChange < 0 ? "down" : "flat") : undefined}
          signal={corePceSignal(corePceLatest?.value)}
          detail="The Federal Reserve's preferred inflation measure. Uses a broader spending basket than CPI and adjusts for consumer substitution behavior. The FOMC's official 2% inflation target is expressed in Core PCE terms."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PCEPILFE"
          dateLabel={fmtCardDate(latest(corePceData)?.date)}
          sparkData={corePceData?.slice(0, 12)}
        />

        <IndicatorCard
          label="PPI (YoY)"
          value={ppiLatest?.value}
          unit="%"
          change={ppiChange}
          changeLabel={ppiChange != null ? formatPP(ppiChange) : undefined}
          direction={ppiChange != null ? (ppiChange > 0 ? "up" : ppiChange < 0 ? "down" : "flat") : undefined}
          signal={ppiSignal(ppiLatest?.value)}
          detail="Producer Price Index for all commodities. Measures price changes at the wholesale level. PPI leads CPI by 3–6 months — upstream cost pressures flow through to consumer prices. Negative PPI is a disinflationary tailwind."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PPIACO"
          dateLabel={fmtCardDate(latest(ppiData)?.date)}
          sparkData={ppiData?.slice(0, 12)}
        />

        <IndicatorCard
          label="10Y Breakeven"
          value={breakevenLatest?.value}
          unit="%"
          change={breakevenChange}
          changeLabel={breakevenChange != null ? formatPP(breakevenChange) : undefined}
          direction={breakevenChange != null ? (breakevenChange > 0 ? "up" : breakevenChange < 0 ? "down" : "flat") : undefined}
          signal={breakevenLatest?.value == null ? "neutral" : breakevenLatest.value > 2.5 ? "bearish" : breakevenLatest.value < 2.0 ? "bullish" : "neutral"}
          detail="The 10-year Treasury breakeven inflation rate — the market's real-time expectation for average annual CPI over the next decade. Derived from the spread between nominal and TIPS yields. Above 2.5% signals the market expects inflation to remain sticky; below 2.0% signals deflation risk."
          source="FRED T10YIE"
          sourceUrl="https://fred.stlouisfed.org/series/T10YIE"
          dateLabel={fmtCardDate(latest(breakevenData)?.date)}
          sparkData={breakevenData?.slice(0, 12)}
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
          dateLabel={fmtCardDate(latest(oilData)?.date)}
          sparkData={oilData?.slice(0, 12)}
        />

      </div>

    </div>
  );
}
