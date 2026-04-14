import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";

const FETCH = {
  GDP:     SERIES.GDP,
  M2:      SERIES.M2,
  HOUSING: SERIES.HOUSING,
  INDPRO:  SERIES.INDPRO,
};

function toQuarterLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const q = month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
}

function buildGdpChartData(raw) {
  if (!raw || raw.length === 0) return [];
  return [...raw].slice(0, 12).reverse().map((pt) => ({
    quarter: toQuarterLabel(pt.date),
    value: pt.value,
  }));
}

function buildIndproChartData(raw) {
  if (!raw || raw.length === 0) return [];
  return [...raw].slice(0, 24).reverse().map((pt) => ({
    date: pt.date.slice(0, 7),
    value: pt.value,
  }));
}

function GdpSummary({ gdpData }) {
  const lat = latest(gdpData);
  const pr = prior(gdpData);
  const pr4 = prior(gdpData, 4); // same quarter prior year
  if (!lat) return null;

  const expanding = lat.value > 0;
  const trend =
    pr == null
      ? "flat"
      : lat.value > pr.value
      ? "accelerating"
      : lat.value < pr.value
      ? "decelerating"
      : "flat";

  const statusColor = expanding
    ? "var(--color-term-green)"
    : "var(--color-term-red)";
  const trendColor =
    trend === "accelerating"
      ? "var(--color-term-green)"
      : trend === "decelerating"
      ? "var(--color-term-amber)"
      : "var(--color-term-dim)";

  // Contextual market signal
  const marketSignal =
    lat.value >= 3.0
      ? "Strong growth favors risk assets and steeper yield curves. Watch for Fed hawkishness if sustained."
      : lat.value >= 1.5
      ? "Moderate expansion. Equities can still perform but sector rotation matters — prefer quality over cyclicals."
      : lat.value >= 0
      ? "Growth is stalling. Credit spreads and defensive positioning deserve attention."
      : "Negative GDP signals contraction. Historically coincides with earnings downgrades and equity drawdowns.";

  // Historical context
  const historicalNote =
    lat.value >= 3.0
      ? "Post-2010 average annualized growth has been ~2.3%; current reading is above trend."
      : lat.value >= 2.0
      ? "Reading is near the post-2010 long-run average of ~2.3%, consistent with trend growth."
      : lat.value >= 0
      ? "Below the post-2010 average of ~2.3%. Sub-trend growth often precedes Fed easing cycles."
      : "Contraction episodes since 2010 have been brief (2020 COVID shock) or mild. Sustained weakness is rare.";

  return (
    <div className="panel" style={{ fontSize: 11, lineHeight: 1.85 }}>
      <div className="section-label">GROWTH SUMMARY</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ color: "var(--color-term-dim)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 2 }}>LATEST GDP</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: statusColor }}>
              {formatNum(lat.value, 1)}%
            </div>
            <div style={{ color: "var(--color-term-dim)", fontSize: 9 }}>{toQuarterLabel(lat.date)} (annualized)</div>
          </div>
          {pr != null && (
            <div>
              <div style={{ color: "var(--color-term-dim)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 2 }}>PRIOR QUARTER</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-term-text)" }}>
                {formatNum(pr.value, 1)}%
              </div>
              <div style={{ color: "var(--color-term-dim)", fontSize: 9 }}>{toQuarterLabel(pr.date)}</div>
            </div>
          )}
          {pr4 != null && (
            <div>
              <div style={{ color: "var(--color-term-dim)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 2 }}>1Y AGO</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-term-text)" }}>
                {formatNum(pr4.value, 1)}%
              </div>
              <div style={{ color: "var(--color-term-dim)", fontSize: 9 }}>{toQuarterLabel(pr4.date)}</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--color-term-border)", paddingTop: 8, display: "flex", gap: 32 }}>
          <div>
            <span style={{ color: "var(--color-term-dim)" }}>STATUS: </span>
            <span style={{ color: statusColor, fontWeight: 600 }}>
              {expanding ? "EXPANDING" : "CONTRACTING"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--color-term-dim)" }}>MOMENTUM: </span>
            <span style={{ color: trendColor, fontWeight: 600 }}>
              {trend.toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-term-border)", paddingTop: 8 }}>
          <div style={{ color: "var(--color-term-dim)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 4 }}>MARKET SIGNAL</div>
          <div style={{ color: "var(--color-term-text)", fontSize: 10, lineHeight: 1.65 }}>{marketSignal}</div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-term-border)", paddingTop: 8 }}>
          <div style={{ color: "var(--color-term-dim)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 4 }}>HISTORICAL CONTEXT</div>
          <div style={{ color: "var(--color-term-dim)", fontSize: 10, lineHeight: 1.65 }}>{historicalNote}</div>
        </div>

      </div>
    </div>
  );
}

export default function Growth() {
  const { data, loading, error } = useFredData(FETCH);

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  const { GDP: gdpRaw, M2: m2Raw, HOUSING: housingRaw, INDPRO: indproRaw } = data;

  const gdpChartData    = buildGdpChartData(gdpRaw);
  const indproChartData = buildIndproChartData(indproRaw);

  const gdpLatest     = latest(gdpRaw);
  const gdpPrior      = prior(gdpRaw);
  const gdpChange     = change(gdpLatest?.value, gdpPrior?.value);

  const m2Latest      = latest(m2Raw);
  const m2Prior       = prior(m2Raw);
  const m2Change      = change(m2Latest?.value, m2Prior?.value);

  const housingLatest = latest(housingRaw);
  const housingPrior  = prior(housingRaw);
  const housingChange = change(housingLatest?.value, housingPrior?.value);

  const indproLatest  = latest(indproRaw);
  const indproPrior   = prior(indproRaw);
  const indproChange  = change(indproLatest?.value, indproPrior?.value);

  const axisStyle = {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 9,
    fill: "var(--color-term-dim)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>

      {/* Row 1: GDP + Industrial Production side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* GDP Bar Chart */}
        <div className="panel">
          <div className="section-label">REAL GDP — QUARTERLY GROWTH RATE (%) — LAST 12 QUARTERS</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={gdpChartData}
              margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
              barCategoryGap="30%"
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-term-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="quarter"
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${formatNum(v, 2)}%`}
                  />
                }
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <ReferenceLine
                y={0}
                stroke="var(--color-term-dim)"
                strokeDasharray="4 4"
              />
              <Bar dataKey="value" name="GDP Growth" radius={[2, 2, 0, 0]}>
                {gdpChartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.value >= 0 ? "var(--color-term-green)" : "var(--color-term-red)"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Industrial Production Line Chart */}
        <div className="panel">
          <div className="section-label">INDUSTRIAL PRODUCTION — YoY % CHANGE — LAST 24 MONTHS</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={indproChartData}
              margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-term-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
                interval={3}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${formatNum(v, 2)}%`}
                  />
                }
                cursor={{ stroke: "var(--color-term-dim)", strokeWidth: 1 }}
              />
              <ReferenceLine
                y={0}
                stroke="var(--color-term-dim)"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="value"
                name="Ind. Production"
                stroke="var(--color-term-green)"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-green)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: GDP Summary full-width */}
      <GdpSummary gdpData={gdpRaw} />

      {/* Row 3: 3-column Indicator Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
        }}
      >
        <IndicatorCard
          label="Real GDP Growth"
          value={gdpLatest?.value}
          unit="%"
          change={gdpChange}
          detail={`Annualized real GDP growth rate for ${gdpLatest ? toQuarterLabel(gdpLatest.date) : "the most recent quarter"} — the broadest measure of U.S. economic output. Sustained readings above 3% historically coincide with tightening Fed policy and rising long-end yields. Sub-2% growth often presages earnings downgrades and sector rotation toward defensives.`}
          source="BEA / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/A191RL1Q225SBEA"
          decimals={1}
        />
        <IndicatorCard
          label="M2 Money Supply"
          value={m2Latest?.value}
          unit="% YoY"
          change={m2Change}
          detail={`Year-over-year change in M2 money supply (${m2Latest ? formatNum(m2Latest.value, 2) : "—"}%), a broad monetary aggregate covering cash, checking, savings, and money market balances. Milton Friedman's rule of thumb linked M2 growth to nominal GDP growth with a ~12–18 month lag. Rapid M2 expansion preceded the 2021–2022 inflation spike; current trajectory matters for the inflation outlook.`}
          source="Federal Reserve / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/M2SL"
          decimals={2}
        />
        <IndicatorCard
          label="Housing Starts"
          value={housingLatest?.value}
          unit="K units"
          change={housingChange}
          detail={`New residential construction starts in thousands of units. Housing is a classic leading indicator — it responds to mortgage rates and consumer confidence before broader economic shifts appear in GDP. Starts above 1,400K signal a healthy construction sector; below 1,000K often coincides with or precedes recessionary conditions. Current mortgage-rate headwinds are a key variable to watch.`}
          source="Census / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/HOUST"
          decimals={0}
        />
        <IndicatorCard
          label="Industrial Production"
          value={indproLatest?.value}
          unit="% YoY"
          change={indproChange}
          detail={`Year-over-year change in industrial output across manufacturing, mining, and electric/gas utilities. INDPRO is a real-time proxy for goods-economy activity and is one of the four coincident indicators used by the NBER to date recessions. Persistent negative readings (especially alongside soft PMIs) are a reliable recession signal. The goods sector has faced inventory-cycle headwinds post-pandemic.`}
          source="Federal Reserve / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/INDPRO"
          decimals={2}
        />
      </div>

    </div>
  );
}
