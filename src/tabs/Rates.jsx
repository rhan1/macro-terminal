import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const SERIES_MAP = {
  DGS1MO:    SERIES.DGS1MO,
  DGS3MO:    SERIES.DGS3MO,
  DGS6MO:    SERIES.DGS6MO,
  DGS1:      SERIES.DGS1,
  DGS2:      SERIES.DGS2,
  DGS5:      SERIES.DGS5,
  DGS7:      SERIES.DGS7,
  DGS10:     SERIES.DGS10,
  DGS20:     SERIES.DGS20,
  DGS30:     SERIES.DGS30,
  FEDFUNDS:  SERIES.FEDFUNDS,
  MORTGAGE30: SERIES.MORTGAGE30,
  T10Y2Y:    SERIES.T10Y2Y,
  T10Y3M:    SERIES.T10Y3M,
};

const MATURITIES = [
  { key: "DGS1MO",  label: "1M" },
  { key: "DGS3MO",  label: "3M" },
  { key: "DGS6MO",  label: "6M" },
  { key: "DGS1",    label: "1Y" },
  { key: "DGS2",    label: "2Y" },
  { key: "DGS5",    label: "5Y" },
  { key: "DGS7",    label: "7Y" },
  { key: "DGS10",   label: "10Y" },
  { key: "DGS20",   label: "20Y" },
  { key: "DGS30",   label: "30Y" },
];

function labelStyle() {
  return {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "var(--color-term-dim)",
    marginBottom: 8,
  };
}

function sectionStyle() {
  return {
    marginBottom: 20,
  };
}

function changeColor(val) {
  if (val == null || isNaN(val)) return "var(--color-term-dim)";
  if (val > 0) return "var(--color-term-green)";
  if (val < 0) return "var(--color-term-red)";
  return "var(--color-term-amber)";
}

function spreadColor(val) {
  if (val == null || isNaN(val)) return "var(--color-term-dim)";
  if (val > 0) return "var(--color-term-green)";
  return "var(--color-term-red)";
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

function YieldCurveTable({ data }) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 11,
        tableLayout: "fixed",
      }}
    >
      <thead>
        <tr>
          {["Maturity", "Yield (%)", "Change (bps)"].map((h) => (
            <th
              key={h}
              style={{
                padding: "5px 8px",
                textAlign: h === "Maturity" ? "left" : "right",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-term-dim)",
                borderBottom: "1px solid var(--color-term-border)",
                fontWeight: 400,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {MATURITIES.map(({ key, label }) => {
          const series = data[key] || [];
          const cur = latest(series);
          const prv = prior(series);
          const bps =
            cur && prv ? ((cur.value - prv.value) * 100).toFixed(1) : null;
          const bpsNum = bps != null ? parseFloat(bps) : null;
          const isInverted = bpsNum != null && bpsNum < 0;

          return (
            <tr
              key={key}
              style={{
                borderBottom: "1px solid var(--color-term-border)",
              }}
            >
              <td
                style={{
                  padding: "6px 8px",
                  color: "var(--color-term-dim)",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  textAlign: "right",
                  color: "var(--color-term-text)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {cur ? `${formatNum(cur.value, 2)}%` : "—"}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: bpsNum == null
                    ? "var(--color-term-dim)"
                    : isInverted
                    ? "var(--color-term-red)"
                    : bpsNum > 0
                    ? "var(--color-term-green)"
                    : "var(--color-term-amber)",
                }}
              >
                {bpsNum == null
                  ? "—"
                  : `${bpsNum > 0 ? "+" : ""}${bps}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function YieldCurveChart({ data }) {
  const chartData = MATURITIES.map(({ key, label }) => {
    const series = data[key] || [];
    const cur = latest(series);
    return { maturity: label, yield: cur ? cur.value : null };
  }).filter((d) => d.yield != null);

  if (chartData.length === 0) return null;

  const minY = Math.min(...chartData.map((d) => d.yield));
  const maxY = Math.max(...chartData.map((d) => d.yield));
  const yPad = 0.2;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-term-border)"
          vertical={false}
        />
        <XAxis
          dataKey="maturity"
          tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
          axisLine={{ stroke: "var(--color-term-border)" }}
          tickLine={false}
        />
        <YAxis
          domain={[Math.max(0, minY - yPad), maxY + yPad]}
          tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          width={42}
        />
        <Tooltip
          content={
            <ChartTooltip formatter={(v) => `${formatNum(v, 3)}%`} />
          }
        />
        <Line
          type="monotone"
          dataKey="yield"
          name="Yield"
          stroke="var(--color-term-green)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-term-green)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function YieldTimeSeriesChart({ data }) {
  const raw10Y = data.DGS10 || [];
  const raw2Y = data.DGS2 || [];

  // Build merged time series (newest-first from FRED, reverse for chart oldest-first)
  const dateMap = {};
  [...raw10Y].reverse().forEach(({ date, value }) => {
    dateMap[date] = { ...dateMap[date], date, y10: value };
  });
  [...raw2Y].reverse().forEach(({ date, value }) => {
    dateMap[date] = { ...dateMap[date], date, y2: value };
  });

  const chartData = Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  if (chartData.length === 0) return null;

  const allVals = chartData.flatMap((d) => [d.y10, d.y2].filter((v) => v != null));
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-term-border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
          axisLine={{ stroke: "var(--color-term-border)" }}
          tickLine={false}
          tickFormatter={fmtDate}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[Math.max(0, minY - 0.1), maxY + 0.1]}
          tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          width={42}
        />
        <Tooltip
          content={
            <ChartTooltip formatter={(v) => `${formatNum(v, 3)}%`} />
          }
        />
        <Line
          type="monotone"
          dataKey="y10"
          name="10Y"
          stroke="var(--color-term-green)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="y2"
          name="2Y"
          stroke="var(--color-term-cyan)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
          {label}
        </div>
      ))}
    </div>
  );
}

export default function Rates() {
  const { data, loading, error } = useFredData(SERIES_MAP);

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Fed Funds
  const ffSeries  = data.FEDFUNDS || [];
  const ffCur     = latest(ffSeries);
  const ffPrv     = prior(ffSeries);
  const ffChange  = ffCur && ffPrv ? ffCur.value - ffPrv.value : null;

  // 10Y
  const d10Series = data.DGS10 || [];
  const d10Cur    = latest(d10Series);
  const d10Prv    = prior(d10Series);
  const d10Change = d10Cur && d10Prv ? d10Cur.value - d10Prv.value : null;

  // 2Y
  const d2Series  = data.DGS2 || [];
  const d2Cur     = latest(d2Series);
  const d2Prv     = prior(d2Series);
  const d2Change  = d2Cur && d2Prv ? d2Cur.value - d2Prv.value : null;

  // 2s10s
  const t10y2ySeries = data.T10Y2Y || [];
  const t10y2yCur    = latest(t10y2ySeries);
  const t10y2yPrv    = prior(t10y2ySeries);
  const t10y2yChange = t10y2yCur && t10y2yPrv ? t10y2yCur.value - t10y2yPrv.value : null;

  // 10Y-3M
  const t10y3mSeries = data.T10Y3M || [];
  const t10y3mCur    = latest(t10y3mSeries);
  const t10y3mPrv    = prior(t10y3mSeries);
  const t10y3mChange = t10y3mCur && t10y3mPrv ? t10y3mCur.value - t10y3mPrv.value : null;

  // Mortgage
  const mortSeries = data.MORTGAGE30 || [];
  const mortCur    = latest(mortSeries);
  const mortPrv    = prior(mortSeries);
  const mortChange = mortCur && mortPrv ? mortCur.value - mortPrv.value : null;

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Indicator Cards 3×2 ── */}
      <div style={sectionStyle()}>
        <div style={labelStyle()}>Key Rate Indicators</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <IndicatorCard
            label="Fed Funds Rate"
            value={ffCur?.value}
            unit="%"
            change={ffChange != null ? (ffChange / Math.abs(ffPrv?.value || 1)) * 100 : null}
            detail="The Federal Reserve's target overnight lending rate between banks. The primary monetary policy tool for controlling inflation and stimulating growth."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DFF"
            decimals={2}
          />
          <IndicatorCard
            label="10-Year Yield"
            value={d10Cur?.value}
            unit="%"
            change={d10Change != null ? (d10Change / Math.abs(d10Prv?.value || 1)) * 100 : null}
            detail="Yield on 10-year US Treasury notes. Widely used as the benchmark for long-term interest rates, affecting mortgages, corporate bonds, and equity valuations."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DGS10"
            decimals={3}
          />
          <IndicatorCard
            label="2-Year Yield"
            value={d2Cur?.value}
            unit="%"
            change={d2Change != null ? (d2Change / Math.abs(d2Prv?.value || 1)) * 100 : null}
            detail="Yield on 2-year US Treasury notes. Most sensitive to Fed policy expectations. Closely tracks the anticipated path of the federal funds rate."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DGS2"
            decimals={3}
          />
          <IndicatorCard
            label="2s10s Spread"
            value={t10y2yCur?.value}
            unit="%"
            change={t10y2yChange != null ? (t10y2yChange / Math.abs(t10y2yPrv?.value || 0.001)) * 100 : null}
            detail="The spread between 10-year and 2-year Treasury yields. A key recession indicator — sustained inversion (negative) has historically preceded downturns by 6–18 months."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y"
            decimals={3}
          />
          <IndicatorCard
            label="10Y–3M Spread"
            value={t10y3mCur?.value}
            unit="%"
            change={t10y3mChange != null ? (t10y3mChange / Math.abs(t10y3mPrv?.value || 0.001)) * 100 : null}
            detail="Spread between 10-year Treasury and 3-month T-bill. The NY Fed uses this to estimate recession probability. Inversion is a strong leading indicator of recession."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/T10Y3M"
            decimals={3}
          />
          <IndicatorCard
            label="30Y Mortgage"
            value={mortCur?.value}
            unit="%"
            change={mortChange != null ? (mortChange / Math.abs(mortPrv?.value || 1)) * 100 : null}
            detail="Freddie Mac 30-year fixed mortgage rate. Directly affects housing affordability and market activity. Strongly correlated with 10-year Treasury yields."
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
            decimals={2}
          />
        </div>
      </div>

      {/* ── Two-column layout: table + curve chart ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Yield Curve Table */}
        <div className="panel">
          <div style={labelStyle()}>Yield Curve — Current</div>
          <YieldCurveTable data={data} />
        </div>

        {/* Yield Curve Shape Chart */}
        <div className="panel">
          <div style={labelStyle()}>Yield Curve Shape</div>
          <div
            style={{
              fontSize: 9,
              color: "var(--color-term-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Yield (%) vs. Maturity
          </div>
          <YieldCurveChart data={data} />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            {(() => {
              const t10 = latest(data.DGS10 || []);
              const t2  = latest(data.DGS2  || []);
              const t3m = latest(data.DGS3MO || []);
              const spread = t10 && t2 ? t10.value - t2.value : null;
              const isInverted = spread != null && spread < 0;
              return (
                <div
                  style={{
                    fontSize: 10,
                    color: isInverted
                      ? "var(--color-term-red)"
                      : "var(--color-term-green)",
                    fontFamily: "monospace",
                  }}
                >
                  {spread == null
                    ? "—"
                    : isInverted
                    ? `INVERTED  2s10s: ${formatNum(spread, 2)}%`
                    : `NORMAL  2s10s: +${formatNum(spread, 2)}%`}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── 10Y vs 2Y Time Series ── */}
      <div className="panel" style={{ marginBottom: 0 }}>
        <div style={labelStyle()}>10Y &amp; 2Y Treasury Yields — Last 30 Days</div>
        <ChartLegend
          items={[
            { color: "var(--color-term-green)", label: "10Y" },
            { color: "var(--color-term-cyan)",  label: "2Y" },
          ]}
        />
        <YieldTimeSeriesChart data={data} />
        <div
          style={{
            marginTop: 8,
            fontSize: 9,
            color: "var(--color-term-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Source: Federal Reserve / FRED · Daily · Sorted Newest-First
        </div>
      </div>

    </div>
  );
}
