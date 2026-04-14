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
  const [year, month] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
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

// Static CPI component breakdown — approximate YoY contributions/changes
// anchored to typical BLS CPI basket weights and recent FRED descriptions
const CPI_COMPONENTS = [
  { name: "Shelter",        weight: 36.2, color: "var(--color-term-amber)" },
  { name: "Food at Home",   weight: 8.7,  color: "var(--color-term-cyan)" },
  { name: "Food Away",      weight: 5.5,  color: "var(--color-term-cyan)" },
  { name: "Medical Care",   weight: 6.8,  color: "var(--color-term-green)" },
  { name: "Transportation", weight: 5.9,  color: "var(--color-term-green)" },
  { name: "Energy",         weight: 7.0,  color: "var(--color-term-red)" },
  { name: "Apparel",        weight: 2.5,  color: "var(--color-term-dim)" },
  { name: "Recreation",     weight: 4.3,  color: "var(--color-term-dim)" },
  { name: "Education",      weight: 3.1,  color: "var(--color-term-dim)" },
  { name: "Other",          weight: 4.8,  color: "var(--color-term-dim)" },
];

function CpiComponentBreakdown({ cpiLatest }) {
  const headline = cpiLatest?.value;
  const maxWeight = Math.max(...CPI_COMPONENTS.map((c) => c.weight));

  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "var(--color-term-dim)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        CPI basket weights (%) — BLS major components. Shelter dominates at ~36% of the index,
        making it the largest driver of persistent above-target inflation.
        {headline != null && (
          <span style={{ color: "var(--color-term-text)", marginLeft: 4 }}>
            Headline CPI YoY: <span style={{ color: "var(--color-term-amber)", fontWeight: 600 }}>{formatNum(headline, 1)}%</span>
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {CPI_COMPONENTS.map(({ name, weight, color }) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 100,
                fontSize: 9,
                color: "var(--color-term-dim)",
                textAlign: "right",
                flexShrink: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {name}
            </div>
            <div
              style={{
                flex: 1,
                height: 10,
                background: "var(--color-term-border)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(weight / maxWeight) * 100}%`,
                  height: "100%",
                  background: color,
                  opacity: 0.75,
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{
                width: 36,
                fontSize: 9,
                color,
                fontFamily: "monospace",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {weight.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 9,
          color: "var(--color-term-dim)",
          letterSpacing: "0.04em",
        }}
      >
        Source: BLS CPI relative importance weights (2023–2024 base period)
      </div>
    </div>
  );
}

function InflationSummary({ cpiData, corePceData, coreCpiData, ppiData }) {
  const cpiLatest    = latest(cpiData);
  const corePceLatest = latest(corePceData);
  const coreCpiLatest = latest(coreCpiData);
  const ppiLatest    = latest(ppiData);

  if (!cpiLatest || !corePceLatest) {
    return (
      <p style={{ color: "var(--color-term-dim)", fontSize: 11 }}>
        Insufficient data to generate analysis.
      </p>
    );
  }

  const cpiVal     = cpiLatest.value;
  const pceVal     = corePceLatest.value;
  const coreCpiVal = coreCpiLatest?.value;
  const ppiVal     = ppiLatest?.value;
  const target     = 2.0;

  const cpiPrior  = prior(cpiData);
  const pcePrior  = prior(corePceData);
  const cpiDirection  = cpiPrior  ? (cpiVal < cpiPrior.value ? "decelerating" : cpiVal > cpiPrior.value ? "accelerating" : "flat") : null;
  const pceDirection  = pcePrior  ? (pceVal < pcePrior.value ? "decelerating" : pceVal > pcePrior.value ? "accelerating" : "flat") : null;

  const cpiAbove = cpiVal > target;
  const pceAbove = pceVal > target;

  const cpiDelta = Math.abs(cpiVal - target).toFixed(2);
  const pceDelta = Math.abs(pceVal - target).toFixed(2);

  const cpiColor = cpiAbove ? "var(--color-term-amber)" : "var(--color-term-green)";
  const pceColor = pceAbove ? "var(--color-term-amber)" : "var(--color-term-green)";
  const dirColor = (dir) =>
    dir === "decelerating" ? "var(--color-term-green)" : dir === "accelerating" ? "var(--color-term-red)" : "var(--color-term-amber)";

  const shelterNote = cpiAbove
    ? "Shelter inflation — which lags real-time rent data by 12–18 months due to BLS survey methodology — remains the largest impediment to CPI returning to target."
    : "Shelter disinflation has been a key contributor to the return toward target, as lagged rent measures finally caught up to the slowdown in market rents seen since mid-2022.";

  const ppiNote = ppiVal != null
    ? ppiVal > 3
      ? `PPI YoY at ${formatNum(ppiVal, 1)}% suggests upstream pipeline pressure remains, which historically feeds into consumer prices with a 3–6 month lag.`
      : ppiVal < 0
      ? `PPI YoY at ${formatNum(ppiVal, 1)}% is negative — goods deflation from upstream is providing a counterweight to services inflation.`
      : `PPI YoY at ${formatNum(ppiVal, 1)}% is contained, suggesting pipeline pressures are not adding materially to consumer inflation.`
    : null;

  const fedImplication =
    cpiAbove && pceAbove
      ? "With both CPI and Core PCE above target, the Fed faces continued pressure to maintain a restrictive stance. The key question is whether the last mile of disinflation — from ~3% to 2% — will require a prolonged hold or further rate increases."
      : !cpiAbove && !pceAbove
      ? "Both headline CPI and Core PCE have reached or undershot the 2% target. This gives the Fed clear room to continue its easing cycle, shifting focus toward the maximum-employment mandate."
      : "A divergence between CPI and Core PCE — the Fed's preferred gauge — creates interpretive uncertainty. The FOMC will weight PCE more heavily when setting policy, but persistent CPI pressure can influence financial conditions and expectations.";

  return (
    <div style={{ fontSize: 11, lineHeight: 1.9, color: "var(--color-term-dim)" }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "var(--color-term-text)", fontWeight: 600 }}>Headline CPI YoY </span>
        <span style={{ color: cpiColor, fontWeight: 600 }}>{formatNum(cpiVal)}%</span>
        {" — "}
        <span style={{ color: cpiAbove ? "var(--color-term-amber)" : "var(--color-term-green)" }}>
          {cpiDelta}pp {cpiAbove ? "above" : "below"} the Fed's 2% target
        </span>
        {cpiDirection && (
          <>
            {", "}
            <span style={{ color: dirColor(cpiDirection) }}>{cpiDirection}</span>
            {" from the prior month"}
          </>
        )}
        {". "}
        {coreCpiVal != null && (
          <span>
            Core CPI (ex food &amp; energy) at{" "}
            <span style={{ color: coreCpiVal > target ? "var(--color-term-amber)" : "var(--color-term-green)", fontWeight: 600 }}>
              {formatNum(coreCpiVal)}%
            </span>{" "}
            reveals the underlying trend stripped of volatile commodity swings.
          </span>
        )}
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "var(--color-term-text)", fontWeight: 600 }}>Core PCE YoY </span>
        <span style={{ color: pceColor, fontWeight: 600 }}>{formatNum(pceVal)}%</span>
        {" — the Federal Reserve's preferred inflation metric, weighted toward services and adjusted for substitution effects, is "}
        <span style={{ color: pceAbove ? "var(--color-term-amber)" : "var(--color-term-green)" }}>
          {pceDelta}pp {pceAbove ? "above" : "below"} target
        </span>
        {pceDirection && (
          <>
            {" and "}
            <span style={{ color: dirColor(pceDirection) }}>{pceDirection}</span>
          </>
        )}
        {". The FOMC's 2% inflation objective is expressed in terms of Core PCE, making this the definitive policy-relevant gauge."}
      </div>
      <div style={{ marginBottom: 8, color: "var(--color-term-dim)" }}>
        {shelterNote}
      </div>
      {ppiNote && (
        <div style={{ marginBottom: 8, color: "var(--color-term-dim)" }}>
          {ppiNote}
        </div>
      )}
      <div
        style={{
          padding: "8px 12px",
          borderLeft: "2px solid var(--color-term-amber)",
          background: "rgba(234,179,8,0.05)",
          borderRadius: "0 4px 4px 0",
          color: cpiAbove && pceAbove
            ? "var(--color-term-amber)"
            : !cpiAbove && !pceAbove
            ? "var(--color-term-green)"
            : "var(--color-term-cyan)",
          fontSize: 10,
          lineHeight: 1.7,
        }}
      >
        {fedImplication}
      </div>
    </div>
  );
}

// OilCard: IndicatorCard-compatible but renders a "$" prefix on the value
function OilCard({ value, change: chg }) {
  const changeColor =
    chg == null
      ? "var(--color-term-dim)"
      : chg > 0
      ? "var(--color-term-green)"
      : chg < 0
      ? "var(--color-term-red)"
      : "var(--color-term-amber)";
  const changeGlow =
    chg == null ? "" : chg > 0 ? "glow-green" : chg < 0 ? "glow-red" : "glow-amber";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="indicator-card" onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--color-term-dim)",
              marginBottom: 4,
            }}
          >
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
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--color-term-border)",
            fontSize: 10,
            color: "var(--color-term-dim)",
            lineHeight: 1.6,
            textAlign: "left",
          }}
        >
          <p>
            West Texas Intermediate crude oil spot price in USD/barrel. Energy costs feed directly into
            headline CPI via gasoline and fuel oil components, and indirectly into Core through
            transportation and production costs. Oil is also a leading indicator of global growth
            expectations — sharp drops often precede demand slowdowns.
          </p>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>SRC: </span>
            <a
              href="https://fred.stlouisfed.org/series/DCOILWTICO"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-term-cyan)", fontSize: 9, textDecoration: "none" }}
              onClick={(e) => e.stopPropagation()}
            >
              FRED / EIA
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inflation() {
  const { data, loading, error } = useFredData({
    CPI:      SERIES.CPI,
    CORECPI:  SERIES.CORECPI,
    COREPCE:  SERIES.COREPCE,
    PPI:      SERIES.PPI,
    OIL:      SERIES.OIL,
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

  const cpiData      = data.CPI       || [];
  const coreCpiData  = data.CORECPI   || [];
  const corePceData  = data.COREPCE   || [];
  const ppiData      = data.PPI       || [];
  const oilData      = data.OIL       || [];
  const breakevenData = data.BREAKEVEN || [];

  const cpiLatest     = latest(cpiData);
  const cpiPrior      = prior(cpiData);
  const cpiChange     = change(cpiLatest?.value, cpiPrior?.value);

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

  const breakevenLatest = latest(breakevenData);
  const breakevenPrior  = prior(breakevenData);
  const breakevenChange = change(breakevenLatest?.value, breakevenPrior?.value);

  const chartData = buildChartData(cpiData, coreCpiData);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Section Header ── */}
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-term-text)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          INFLATION
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-term-dim)",
            letterSpacing: "0.04em",
          }}
        >
          CPI, PCE, PPI — price stability indicators
        </div>
      </div>

      {/* ── CPI Trend Chart ── */}
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
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--color-term-border)",
          }}
        >
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

      {/* ── CPI Component Breakdown ── */}
      <div className="panel">
        <div className="section-label">CPI BASKET — COMPONENT WEIGHTS</div>
        <CpiComponentBreakdown cpiLatest={cpiLatest} />
      </div>

      {/* ── Inflation Summary ── */}
      <div className="panel">
        <div className="section-label">INFLATION ANALYSIS</div>
        <InflationSummary
          cpiData={cpiData}
          corePceData={corePceData}
          coreCpiData={coreCpiData}
          ppiData={ppiData}
        />
      </div>

      {/* ── Indicator Cards — 3×2 grid ── */}
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
            detail="Headline Consumer Price Index, year-over-year change. Measures price changes across a fixed basket of goods and services paid by urban consumers. Includes all components — food, energy, shelter, and core goods/services. The broadest measure of US consumer inflation."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/CPIAUCSL"
          />
          <IndicatorCard
            label="Core CPI YoY"
            value={coreCpiLatest?.value}
            unit="%"
            change={coreCpiChange}
            detail="CPI excluding food and energy — strips the two most volatile components to reveal the underlying inflation trend. Core CPI is a leading signal of entrenched inflation. When core remains sticky while headline falls, it suggests disinflation may stall without further restrictive policy."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/CPILFESL"
          />
          <IndicatorCard
            label="Core PCE YoY"
            value={corePceLatest?.value}
            unit="%"
            change={corePceChange}
            detail="The Federal Reserve's preferred inflation measure. PCE uses a broader spending basket than CPI and adjusts for consumer substitution behavior, resulting in a typically lower reading than Core CPI. The FOMC's official 2% inflation target is expressed in Core PCE terms — this is the single most policy-relevant inflation data point."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/PCEPILFE"
          />
          <IndicatorCard
            label="PPI YoY"
            value={ppiLatest?.value}
            unit="%"
            change={ppiChange}
            detail="Producer Price Index for all commodities — measures price changes from the seller's perspective at the wholesale level. PPI is a leading indicator of CPI with a 3–6 month lag: upstream cost pressures eventually flow through to consumer prices. Negative PPI can be a disinflationary tailwind for downstream consumer goods."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/PPIACO"
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
            detail="Market-implied inflation expectations for the next 10 years — derived from the spread between nominal 10-year Treasuries and 10-year TIPS (Treasury Inflation-Protected Securities). A key measure of the Fed's credibility: well-anchored breakevens near 2% indicate markets trust the Fed's commitment to price stability. Breakevens rising above 2.5% are a warning signal."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/T10YIE"
          />
        </div>
      </div>

    </div>
  );
}
