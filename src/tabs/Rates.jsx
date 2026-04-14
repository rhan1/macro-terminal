import { useState } from "react";
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
          const isNeg = bpsNum != null && bpsNum < 0;

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
                    : isNeg
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
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 9,
            color: "var(--color-term-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// Spread card that colors the main value green/red based on whether spread is positive/negative
function SpreadCard({ label, value, chg, detail, sourceUrl }) {
  const spreadColor =
    value == null || isNaN(value)
      ? "var(--color-term-dim)"
      : value > 0
      ? "var(--color-term-green)"
      : "var(--color-term-red)";

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
            {label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: spreadColor }}>
            {value != null ? `${value >= 0 ? "+" : ""}${formatNum(value, 3)}%` : "—"}
          </div>
        </div>
        {chg != null && (
          <span className={changeGlow} style={{ color: changeColor, fontSize: 11, fontWeight: 500 }}>
            {formatPct(chg)}
          </span>
        )}
      </div>
      {expanded && detail && (
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
          <p>{detail}</p>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>SRC: </span>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-term-cyan)", fontSize: 9, textDecoration: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                FRED
              </a>
            ) : (
              <span style={{ color: "var(--color-term-cyan)", fontSize: 9 }}>FRED</span>
            )}
          </div>
        </div>
      )}
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
  const ffSeries = data.FEDFUNDS || [];
  const ffCur    = latest(ffSeries);
  const ffPrv    = prior(ffSeries);

  // 10Y
  const d10Series = data.DGS10 || [];
  const d10Cur    = latest(d10Series);
  const d10Prv    = prior(d10Series);

  // 2Y
  const d2Series = data.DGS2 || [];
  const d2Cur    = latest(d2Series);
  const d2Prv    = prior(d2Series);

  // 2s10s
  const t10y2ySeries = data.T10Y2Y || [];
  const t10y2yCur    = latest(t10y2ySeries);
  const t10y2yPrv    = prior(t10y2ySeries);

  // 10Y-3M
  const t10y3mSeries = data.T10Y3M || [];
  const t10y3mCur    = latest(t10y3mSeries);
  const t10y3mPrv    = prior(t10y3mSeries);

  // Mortgage
  const mortSeries = data.MORTGAGE30 || [];
  const mortCur    = latest(mortSeries);
  const mortPrv    = prior(mortSeries);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Section Header ── */}
      <div style={{ marginBottom: 20 }}>
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
          RATES &amp; YIELD CURVE
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-term-dim)",
            letterSpacing: "0.04em",
          }}
        >
          Treasury yields, spreads, and monetary policy indicators
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
              const t10  = latest(data.DGS10 || []);
              const t2   = latest(data.DGS2  || []);
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
      <div className="panel" style={{ marginBottom: 20 }}>
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
            change={change(ffCur?.value, ffPrv?.value)}
            detail={`The Federal Reserve's target overnight lending rate, currently ${ffCur ? formatNum(ffCur.value, 2) : "—"}%. Set by the FOMC to balance maximum employment and price stability. After 525 bps of hikes in 2022–2023 — the fastest tightening cycle since the 1980s — the Fed began cutting in late 2024. Rate changes transmit to the entire economy via lending costs, mortgage rates, and bond yields.`}
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DFF"
            decimals={2}
          />
          <IndicatorCard
            label="10-Year Yield"
            value={d10Cur?.value}
            unit="%"
            change={change(d10Cur?.value, d10Prv?.value)}
            detail={`The benchmark long-term interest rate. The 10Y Treasury yield is used globally to price mortgages, corporate debt, and equity risk premiums. When yields rise sharply — as in 2022–2023 when the 10Y hit 5% for the first time since 2007 — valuations compress across assets. The yield reflects both Fed policy expectations and term premium, which markets demand to hold duration risk.`}
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DGS10"
            decimals={3}
          />
          <IndicatorCard
            label="2-Year Yield"
            value={d2Cur?.value}
            unit="%"
            change={change(d2Cur?.value, d2Prv?.value)}
            detail={`The most policy-sensitive point on the curve. The 2Y yield closely tracks market expectations for the federal funds rate over the next two years — effectively a prediction of where the Fed will be. When the 2Y trades well above the 10Y (inversion), it signals that markets expect the Fed to cut rates ahead as growth deteriorates. The 2Y peaked above 5.1% in 2023 — its highest since 2006.`}
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/DGS2"
            decimals={3}
          />
          <SpreadCard
            label="2s10s Spread"
            value={t10y2yCur?.value}
            chg={change(t10y2yCur?.value, t10y2yPrv?.value)}
            detail={`The spread between the 10-year and 2-year Treasury yields — the classic recession signal. A sustained inversion (negative reading) has preceded every US recession since the 1970s with a typical lead time of 6–18 months. The curve inverted deeply in 2022–2023, the steepest inversion since 1981. A return to positive territory (re-steepening) can signal either Fed cuts ahead or growth re-acceleration — context matters.`}
            sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y"
          />
          <SpreadCard
            label="10Y–3M Spread"
            value={t10y3mCur?.value}
            chg={change(t10y3mCur?.value, t10y3mPrv?.value)}
            detail={`The NY Federal Reserve's preferred recession indicator — used in its widely-cited recession probability model. Academic research (Estrella & Mishkin) shows this spread has the strongest predictive power of any yield curve measure. When inverted, it has preceded all eight US recessions since 1960 with fewer false positives than the 2s10s. An inversion here is considered a high-conviction warning signal by professional forecasters.`}
            sourceUrl="https://fred.stlouisfed.org/series/T10Y3M"
          />
          <IndicatorCard
            label="30Y Mortgage"
            value={mortCur?.value}
            unit="%"
            change={change(mortCur?.value, mortPrv?.value)}
            detail={`Freddie Mac's weekly 30-year fixed mortgage survey rate — the primary cost of homeownership for most Americans. Tightly linked to the 10Y Treasury yield plus a spread of ~170 bps on average, though that spread widened sharply during the 2022–2023 tightening cycle. Rates above 7% — last seen in the early 2000s — have caused a severe affordability crunch and locked existing homeowners out of moving (the "lock-in effect").`}
            source="FRED"
            sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
            decimals={2}
          />
        </div>
      </div>

    </div>
  );
}
