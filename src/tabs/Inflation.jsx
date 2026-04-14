import { useState } from "react";
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYear(dateStr) {
  // dateStr is "YYYY-MM-DD"
  const [year, month] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

function buildChartData(cpiArr, coreCpiArr) {
  if (!cpiArr || !coreCpiArr) return [];

  // Both arrays are newest-first; reverse to get oldest-first for chart
  const cpiAsc = [...cpiArr].reverse();
  const coreCpiAsc = [...coreCpiArr].reverse();

  // Build a map from date string -> values
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

  // Sort by date ascending and format label
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-24)
    .map((pt) => ({ ...pt, label: formatMonthYear(pt.date) }));
}

function InflationSummary({ cpiData, corePceData }) {
  const cpiLatest = latest(cpiData);
  const corePceLatest = latest(corePceData);

  if (!cpiLatest || !corePceLatest) {
    return (
      <p style={{ color: "var(--color-term-dim)", fontSize: 11 }}>
        Insufficient data to generate analysis.
      </p>
    );
  }

  const cpiVal = cpiLatest.value;
  const pceVal = corePceLatest.value;
  const target = 2.0;

  const cpiPrior = prior(cpiData);
  const pcePrior = prior(corePceData);
  const cpiDirection = cpiPrior ? (cpiVal < cpiPrior.value ? "decelerating" : cpiVal > cpiPrior.value ? "accelerating" : "flat") : null;
  const pceDirection = pcePrior ? (pceVal < pcePrior.value ? "decelerating" : pceVal > pcePrior.value ? "accelerating" : "flat") : null;

  const cpiAbove = cpiVal > target;
  const pceAbove = pceVal > target;

  const cpiDelta = Math.abs(cpiVal - target).toFixed(2);
  const pceDelta = Math.abs(pceVal - target).toFixed(2);

  const cpiColor = cpiAbove ? "var(--color-term-amber)" : "var(--color-term-green)";
  const pceColor = pceAbove ? "var(--color-term-amber)" : "var(--color-term-green)";
  const directionColor = (dir) =>
    dir === "decelerating" ? "var(--color-term-green)" : dir === "accelerating" ? "var(--color-term-red)" : "var(--color-term-amber)";

  return (
    <div style={{ fontSize: 11, lineHeight: 1.8, color: "var(--color-term-dim)" }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "var(--color-term-text)" }}>CPI YoY </span>
        <span style={{ color: cpiColor, fontWeight: 600 }}>{formatNum(cpiVal)}%</span>
        {" — "}
        <span style={{ color: cpiAbove ? "var(--color-term-amber)" : "var(--color-term-green)" }}>
          {cpiDelta}pp {cpiAbove ? "above" : "below"} the 2% Fed target
        </span>
        {cpiDirection && (
          <>
            {", "}
            <span style={{ color: directionColor(cpiDirection) }}>{cpiDirection}</span>
            {" month-over-month"}
          </>
        )}
        {"."}
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "var(--color-term-text)" }}>Core PCE </span>
        <span style={{ color: pceColor, fontWeight: 600 }}>{formatNum(pceVal)}%</span>
        {" — the Fed's preferred inflation gauge is "}
        <span style={{ color: pceAbove ? "var(--color-term-amber)" : "var(--color-term-green)" }}>
          {pceDelta}pp {pceAbove ? "above" : "below"} target
        </span>
        {pceDirection && (
          <>
            {" and "}
            <span style={{ color: directionColor(pceDirection) }}>{pceDirection}</span>
          </>
        )}
        {"."}
      </div>
      <div>
        {cpiAbove && pceAbove ? (
          <span style={{ color: "var(--color-term-amber)" }}>
            Both headline and core measures remain above the 2% target. Disinflation progress is ongoing but incomplete.
          </span>
        ) : !cpiAbove && !pceAbove ? (
          <span style={{ color: "var(--color-term-green)" }}>
            Both headline and core inflation are at or below the 2% target. Price stability objectives appear to be met.
          </span>
        ) : (
          <span style={{ color: "var(--color-term-cyan)" }}>
            Mixed signal: headline and core readings diverge around the 2% target. Monitor for convergence.
          </span>
        )}
      </div>
    </div>
  );
}

// Oil card uses a "$" prefix which IndicatorCard doesn't natively support
function OilCard({ value, change: chg }) {
  const changeColor =
    chg == null
      ? "var(--color-term-dim)"
      : chg > 0
      ? "var(--color-term-green)"
      : chg < 0
      ? "var(--color-term-red)"
      : "var(--color-term-amber)";
  const changeGlow = chg == null ? "" : chg > 0 ? "glow-green" : chg < 0 ? "glow-red" : "glow-amber";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="indicator-card" onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-term-dim)", marginBottom: 4 }}>
            WTI Crude Oil
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-term-text)" }}>
            {value != null ? `$${formatNum(value, 2)}` : "—"}
          </div>
        </div>
        {chg != null && (
          <span className={changeGlow} style={{ color: changeColor, fontSize: 11, fontWeight: 500 }}>
            {formatPct(chg)}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-term-border)", fontSize: 10, color: "var(--color-term-dim)", lineHeight: 1.6 }}>
          <p>West Texas Intermediate crude oil spot price in USD/barrel — a key driver of energy and transportation costs.</p>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>SRC: </span>
            <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>FRED</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inflation() {
  const { data, loading, error } = useFredData({
    CPI: SERIES.CPI,
    CORECPI: SERIES.CORECPI,
    COREPCE: SERIES.COREPCE,
    PPI: SERIES.PPI,
    OIL: SERIES.OIL,
    BREAKEVEN: SERIES.BREAKEVEN,
  });

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  const cpiData = data.CPI || [];
  const coreCpiData = data.CORECPI || [];
  const corePceData = data.COREPCE || [];
  const ppiData = data.PPI || [];
  const oilData = data.OIL || [];
  const breakevenData = data.BREAKEVEN || [];

  const cpiLatest = latest(cpiData);
  const cpiPrior = prior(cpiData);
  const cpiChange = change(cpiLatest?.value, cpiPrior?.value);

  const coreCpiLatest = latest(coreCpiData);
  const coreCpiPrior = prior(coreCpiData);
  const coreCpiChange = change(coreCpiLatest?.value, coreCpiPrior?.value);

  const corePceLatest = latest(corePceData);
  const corePcePrior = prior(corePceData);
  const corePceChange = change(corePceLatest?.value, corePcePrior?.value);

  const ppiLatest = latest(ppiData);
  const ppiPrior = prior(ppiData);
  const ppiChange = change(ppiLatest?.value, ppiPrior?.value);

  const oilLatest = latest(oilData);
  const oilPrior = prior(oilData);
  const oilChange = change(oilLatest?.value, oilPrior?.value);

  const breakevenLatest = latest(breakevenData);
  const breakevenPrior = prior(breakevenData);
  const breakevenChange = change(breakevenLatest?.value, breakevenPrior?.value);

  const chartData = buildChartData(cpiData, coreCpiData);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* CPI Trend Chart */}
      <div className="panel">
        <div className="section-label">CPI TREND — LAST 24 MONTHS</div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid
              stroke="var(--color-term-border)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-term-dim)", fontSize: 9, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-term-border)" }}
              interval="preserveStartEnd"
              tickCount={6}
            />
            <YAxis
              tick={{ fill: "var(--color-term-dim)", fontSize: 9, fontFamily: "inherit" }}
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
              y={2.0}
              stroke="var(--color-term-amber)"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{
                value: "2% TARGET",
                position: "insideTopRight",
                fill: "var(--color-term-amber)",
                fontSize: 8,
                fontFamily: "inherit",
                dy: -4,
              }}
            />
            <Bar
              dataKey="cpi"
              name="CPI YoY"
              fill="rgba(74,222,128,0.30)"
              stroke="rgba(74,222,128,0.55)"
              strokeWidth={0.5}
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
            />
            <Line
              dataKey="coreCpi"
              name="Core CPI YoY"
              type="monotone"
              stroke="var(--color-term-cyan)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "var(--color-term-cyan)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 20, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-term-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--color-term-dim)" }}>
            <div style={{ width: 12, height: 10, background: "rgba(74,222,128,0.30)", border: "0.5px solid rgba(74,222,128,0.55)", borderRadius: 2 }} />
            CPI YoY
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--color-term-dim)" }}>
            <div style={{ width: 16, height: 2, background: "var(--color-term-cyan)", borderRadius: 1 }} />
            Core CPI YoY
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--color-term-dim)" }}>
            <div style={{ width: 16, height: 1, background: "var(--color-term-amber)", borderRadius: 1, borderTop: "1px dashed var(--color-term-amber)" }} />
            Fed 2% Target
          </div>
        </div>
      </div>

      {/* Inflation Summary */}
      <div className="panel">
        <div className="section-label">INFLATION ANALYSIS</div>
        <InflationSummary cpiData={cpiData} corePceData={corePceData} />
      </div>

      {/* Indicator Cards — 3x2 grid */}
      <div>
        <div className="section-label">KEY INDICATORS</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <IndicatorCard
            label="CPI YoY"
            value={cpiLatest?.value}
            unit="%"
            change={cpiChange}
            detail="Headline Consumer Price Index, year-over-year change. Includes food and energy components."
            source="FRED"
          />
          <IndicatorCard
            label="Core CPI YoY"
            value={coreCpiLatest?.value}
            unit="%"
            change={coreCpiChange}
            detail="CPI excluding food and energy — strips volatile components to reveal underlying inflation trend."
            source="FRED"
          />
          <IndicatorCard
            label="Core PCE YoY"
            value={corePceLatest?.value}
            unit="%"
            change={corePceChange}
            detail="The Fed's preferred inflation measure; Personal Consumption Expenditures excluding food and energy."
            source="FRED"
          />
          <IndicatorCard
            label="PPI YoY"
            value={ppiLatest?.value}
            unit="%"
            change={ppiChange}
            detail="Producer Price Index for all commodities — upstream price pressures that can feed into consumer inflation."
            source="FRED"
          />
          <OilCard
            value={oilLatest?.value}
            change={oilChange}
          />
          <IndicatorCard
            label="10Y Breakeven Rate"
            value={breakevenLatest?.value}
            unit="%"
            change={breakevenChange}
            detail="Market-implied inflation expectations over the next 10 years, derived from TIPS vs. nominal Treasury spread."
            source="FRED"
          />
        </div>
      </div>
    </div>
  );
}
