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
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const q = month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
}

function buildGdpChartData(raw) {
  if (!raw || raw.length === 0) return [];
  // raw is newest-first; take up to 12, reverse for chronological order
  return [...raw].slice(0, 12).reverse().map((pt) => ({
    quarter: toQuarterLabel(pt.date),
    value: pt.value,
  }));
}

function buildIndproChartData(raw) {
  if (!raw || raw.length === 0) return [];
  return [...raw].slice(0, 24).reverse().map((pt) => ({
    date: pt.date.slice(0, 7), // "YYYY-MM"
    value: pt.value,
  }));
}

function GdpSummary({ gdpData }) {
  const lat = latest(gdpData);
  const pr = prior(gdpData);
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

  return (
    <div className="panel" style={{ fontSize: 11, lineHeight: 1.8 }}>
      <div className="section-label">GROWTH SUMMARY</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <span style={{ color: "var(--color-term-dim)" }}>LATEST GDP GROWTH: </span>
          <span style={{ color: statusColor, fontWeight: 600 }}>
            {formatNum(lat.value, 1)}%
          </span>
          <span style={{ color: "var(--color-term-dim)" }}> ({toQuarterLabel(lat.date)})</span>
        </div>
        <div>
          <span style={{ color: "var(--color-term-dim)" }}>STATUS: </span>
          <span style={{ color: statusColor, fontWeight: 600 }}>
            {expanding ? "EXPANDING" : "CONTRACTING"}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--color-term-dim)" }}>TREND: </span>
          <span style={{ color: trendColor, fontWeight: 600 }}>
            {trend.toUpperCase()}
          </span>
          {pr != null && (
            <span style={{ color: "var(--color-term-dim)" }}>
              {" "}(prior: {formatNum(pr.value, 1)}%)
            </span>
          )}
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
  const gdpChange     = gdpLatest && gdpPrior ? gdpLatest.value - gdpPrior.value : null;

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

      {/* Row 1: GDP Bar Chart + Growth Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>

        {/* GDP Bar Chart */}
        <div className="panel">
          <div className="section-label">REAL GDP — QUARTERLY GROWTH RATE (%)</div>
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

        {/* Growth Summary */}
        <GdpSummary gdpData={gdpRaw} />
      </div>

      {/* Row 2: Industrial Production Line Chart */}
      <div className="panel">
        <div className="section-label">INDUSTRIAL PRODUCTION — YoY % CHANGE (24 MONTHS)</div>
        <ResponsiveContainer width="100%" height={180}>
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

      {/* Row 3: 2x2 Indicator Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <IndicatorCard
          label="Real GDP Growth"
          value={gdpLatest?.value}
          unit="%"
          change={gdpChange}
          detail="Annualized real GDP growth rate for the most recent quarter, the broadest measure of U.S. economic output."
          source="FRED"
          decimals={1}
        />
        <IndicatorCard
          label="M2 Money Supply"
          value={m2Latest?.value}
          unit="% YoY"
          change={m2Change}
          detail="Year-over-year change in M2 money supply, a broad measure of money in circulation that can signal inflationary pressure."
          source="FRED"
          decimals={2}
        />
        <IndicatorCard
          label="Housing Starts"
          value={housingLatest?.value}
          unit="K units"
          change={housingChange}
          detail="New residential construction starts (thousands of units), a leading indicator of economic activity and consumer confidence."
          source="FRED"
          decimals={0}
        />
        <IndicatorCard
          label="Industrial Production"
          value={indproLatest?.value}
          unit="% YoY"
          change={indproChange}
          detail="Year-over-year change in industrial output across manufacturing, mining, and utilities — a real-time proxy for economic activity."
          source="FRED"
          decimals={2}
        />
      </div>

    </div>
  );
}
