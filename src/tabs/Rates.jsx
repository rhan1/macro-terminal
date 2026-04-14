import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
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

const TENORS = MATURITIES.map((m) => m.label);

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(220,20%,7%)",
  border: "1px solid hsl(220,15%,14%)",
  borderRadius: 2,
  fontSize: 10,
  fontFamily: "JetBrains Mono, monospace",
};

const AXIS_TICK = { fontSize: 9, fill: "hsl(220,10%,35%)" };

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

function YieldCurveTable({ data }) {
  const thBase = {
    padding: "5px 8px",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "hsl(220,10%,35%)",
    borderBottom: "1px solid hsl(220,15%,14%)",
    fontWeight: 400,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
          tableLayout: "auto",
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: "left" }}>Maturity</th>
            {TENORS.map((t) => (
              <th key={t} style={{ ...thBase, textAlign: "right" }}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Current row */}
          <tr style={{ borderBottom: "1px solid hsl(220,15%,14%)" }}>
            <td
              style={{
                padding: "6px 8px",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "hsl(220,10%,35%)",
                whiteSpace: "nowrap",
              }}
            >
              Current
            </td>
            {MATURITIES.map(({ key }) => {
              const cur = latest(data[key] || []);
              return (
                <td
                  key={key}
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    color: "hsl(142,70%,55%)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {cur ? `${formatNum(cur.value, 2)}%` : "—"}
                </td>
              );
            })}
          </tr>
          {/* Chg (bps) row */}
          <tr>
            <td
              style={{
                padding: "6px 8px",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "hsl(220,10%,35%)",
                whiteSpace: "nowrap",
              }}
            >
              Chg (bps)
            </td>
            {MATURITIES.map(({ key }) => {
              const series = data[key] || [];
              const cur = latest(series);
              const prv = prior(series);
              const bpsRaw = cur && prv ? (cur.value - prv.value) * 100 : null;
              const bps = bpsRaw != null ? parseFloat(bpsRaw.toFixed(1)) : null;
              const color =
                bps == null
                  ? "hsl(220,10%,35%)"
                  : bps < 0
                  ? "hsl(142,70%,55%)"
                  : bps > 0
                  ? "hsl(0,72%,55%)"
                  : "hsl(220,10%,35%)";
              return (
                <td
                  key={key}
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {bps == null ? "—" : `${bps > 0 ? "+" : ""}${bps.toFixed(1)}`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function YieldCurveShape({ data }) {
  const chartData = MATURITIES.map(({ key, label }) => {
    const cur = latest(data[key] || []);
    return { maturity: label, yield: cur ? cur.value : null };
  }).filter((d) => d.yield != null);

  if (chartData.length === 0) return null;

  const latestDate = (() => {
    for (const { key } of MATURITIES) {
      const cur = latest(data[key] || []);
      if (cur) return cur.date;
    }
    return null;
  })();

  const minY = Math.min(...chartData.map((d) => d.yield));
  const maxY = Math.max(...chartData.map((d) => d.yield));

  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "hsl(220,10%,35%)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {latestDate ? `As of ${latestDate}` : "Yield Curve"}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(142,70%,55%)" stopOpacity={0.20} />
              <stop offset="100%" stopColor="hsl(142,70%,55%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(220,15%,14%)"
            vertical={false}
          />
          <XAxis
            dataKey="maturity"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
          />
          <YAxis
            domain={[Math.max(0, minY - 0.2), maxY + 0.2]}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            width={38}
          />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${formatNum(v, 3)}%`} />}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(142,70%,55%)" }}
          />
          <Area
            type="monotone"
            dataKey="yield"
            name="Yield"
            stroke="hsl(142,70%,55%)"
            strokeWidth={2}
            fill="url(#greenGrad)"
            dot={{ r: 3, fill: "hsl(142,70%,55%)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function YieldTimeSeries({ data }) {
  const raw10Y = data.DGS10 || [];
  const raw2Y  = data.DGS2  || [];

  const dateMap = {};
  [...raw10Y].forEach(({ date, value }) => {
    dateMap[date] = { ...dateMap[date], date, y10: value };
  });
  [...raw2Y].forEach(({ date, value }) => {
    dateMap[date] = { ...dateMap[date], date, y2: value };
  });

  const chartData = Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  if (chartData.length === 0) return null;

  const allVals = chartData.flatMap((d) =>
    [d.y10, d.y2].filter((v) => v != null)
  );
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(220,15%,14%)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={AXIS_TICK}
          tickFormatter={fmtDate}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[Math.max(0, minY - 0.1), maxY + 0.1]}
          axisLine={false}
          tickLine={false}
          tick={AXIS_TICK}
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          width={38}
        />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `${formatNum(v, 3)}%`} />}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "hsl(142,70%,55%)" }}
        />
        <Line
          type="monotone"
          dataKey="y10"
          name="10Y"
          stroke="hsl(142,70%,55%)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="y2"
          name="2Y"
          stroke="hsl(185,70%,55%)"
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
    <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
      {items.map(({ color, label }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 9,
            color: "hsl(220,10%,35%)",
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

function spreadSignal(value) {
  if (value == null) return "neutral";
  if (value < 0) return "bearish";
  if (value > 0.5) return "bullish";
  return "neutral";
}

function t10y3mSignal(value) {
  if (value == null) return "neutral";
  if (value < 0) return "bearish";
  if (value > 0) return "bullish";
  return "neutral";
}

function mortgageSignal(value) {
  if (value == null) return "neutral";
  if (value > 7) return "bearish";
  if (value < 5) return "bullish";
  return "neutral";
}

function directionFromChange(chg) {
  if (chg == null) return "flat";
  if (chg > 0) return "up";
  if (chg < 0) return "down";
  return "flat";
}

function bpsLabel(cur, prv) {
  if (cur == null || prv == null) return null;
  const bps = ((cur - prv) * 100).toFixed(1);
  const n = parseFloat(bps);
  return `${n > 0 ? "+" : ""}${bps} bps`;
}

export default function Rates() {
  const { data, loading, error } = useFredData(SERIES_MAP);

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 24, color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Series helpers
  const ffSeries    = data.FEDFUNDS  || [];
  const d10Series   = data.DGS10     || [];
  const d2Series    = data.DGS2      || [];
  const t10y2ySeries = data.T10Y2Y   || [];
  const t10y3mSeries = data.T10Y3M   || [];
  const mortSeries  = data.MORTGAGE30 || [];

  const ffCur     = latest(ffSeries);
  const ffPrv     = prior(ffSeries);
  const d10Cur    = latest(d10Series);
  const d10Prv    = prior(d10Series);
  const d2Cur     = latest(d2Series);
  const d2Prv     = prior(d2Series);
  const t10y2yCur = latest(t10y2ySeries);
  const t10y2yPrv = prior(t10y2ySeries);
  const t10y3mCur = latest(t10y3mSeries);
  const t10y3mPrv = prior(t10y3mSeries);
  const mortCur   = latest(mortSeries);
  const mortPrv   = prior(mortSeries);

  const d10Chg  = change(d10Cur?.value,    d10Prv?.value);
  const d2Chg   = change(d2Cur?.value,     d2Prv?.value);
  const t2yChg  = change(t10y2yCur?.value, t10y2yPrv?.value);
  const t3mChg  = change(t10y3mCur?.value, t10y3mPrv?.value);
  const mortChg = change(mortCur?.value,   mortPrv?.value);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Section Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(142,70%,55%)" }}>
          $ RATES &amp; YIELD CURVE
        </div>
        <div style={{ fontSize: 10, color: "hsl(220,10%,35%)", marginTop: 2 }}>
          — Click any card for analysis
        </div>
      </div>

      {/* ── Yield Curve Snapshot Table ── */}
      <div
        style={{
          background: "hsl(220,15%,10%)",
          border: "1px solid hsl(220,15%,14%)",
          borderRadius: 4,
          padding: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "hsl(220,10%,35%)",
            marginBottom: 10,
          }}
        >
          Yield Curve Snapshot
        </div>
        <YieldCurveTable data={data} />
      </div>

      {/* ── Two charts side-by-side ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Left: Yield Curve Shape */}
        <div
          style={{
            background: "hsl(220,15%,10%)",
            border: "1px solid hsl(220,15%,14%)",
            borderRadius: 4,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "hsl(220,10%,35%)",
              marginBottom: 10,
            }}
          >
            Yield Curve Shape
          </div>
          <YieldCurveShape data={data} />
        </div>

        {/* Right: Yield Time Series */}
        <div
          style={{
            background: "hsl(220,15%,10%)",
            border: "1px solid hsl(220,15%,14%)",
            borderRadius: 4,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "hsl(220,10%,35%)",
              marginBottom: 8,
            }}
          >
            Yield Time Series
          </div>
          <ChartLegend
            items={[
              { color: "hsl(185,70%,55%)", label: "2Y" },
              { color: "hsl(142,70%,55%)", label: "10Y" },
            ]}
          />
          <YieldTimeSeries data={data} />
        </div>
      </div>

      {/* ── 6 Indicator Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        <IndicatorCard
          label="Fed Funds Rate"
          value={ffCur?.value}
          unit="%"
          change={change(ffCur?.value, ffPrv?.value)}
          changeLabel={bpsLabel(ffCur?.value, ffPrv?.value)}
          direction="flat"
          signal="neutral"
          detail={`The Federal Reserve's target overnight lending rate, currently ${ffCur ? formatNum(ffCur.value, 2) : "—"}%. Set by the FOMC to balance maximum employment and price stability. After 525 bps of hikes in 2022–2023 — the fastest tightening cycle since the 1980s — the Fed began cutting in late 2024. Rate changes transmit to the entire economy via lending costs, mortgage rates, and bond yields.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/DFF"
          decimals={2}
        />

        <IndicatorCard
          label="10Y Treasury Yield"
          value={d10Cur?.value}
          unit="%"
          change={d10Chg}
          changeLabel={bpsLabel(d10Cur?.value, d10Prv?.value)}
          direction={directionFromChange(d10Chg)}
          signal={d10Chg == null ? "neutral" : d10Chg > 0 ? "bearish" : "bullish"}
          detail={`The benchmark long-term interest rate. The 10Y Treasury yield is used globally to price mortgages, corporate debt, and equity risk premiums. When yields rise sharply — as in 2022–2023 when the 10Y hit 5% for the first time since 2007 — valuations compress across assets. The yield reflects both Fed policy expectations and term premium, which markets demand to hold duration risk.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/DGS10"
          decimals={3}
        />

        <IndicatorCard
          label="2Y Treasury Yield"
          value={d2Cur?.value}
          unit="%"
          change={d2Chg}
          changeLabel={bpsLabel(d2Cur?.value, d2Prv?.value)}
          direction={directionFromChange(d2Chg)}
          signal={d2Chg == null ? "neutral" : d2Chg > 0 ? "bearish" : "bullish"}
          detail={`The most policy-sensitive point on the curve. The 2Y yield closely tracks market expectations for the federal funds rate over the next two years — effectively a prediction of where the Fed will be. When the 2Y trades well above the 10Y (inversion), it signals that markets expect the Fed to cut rates ahead as growth deteriorates. The 2Y peaked above 5.1% in 2023 — its highest since 2006.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/DGS2"
          decimals={3}
        />

        <IndicatorCard
          label="2s10s Spread"
          value={t10y2yCur?.value}
          unit="%"
          change={t2yChg}
          changeLabel={bpsLabel(t10y2yCur?.value, t10y2yPrv?.value)}
          direction={directionFromChange(t2yChg)}
          signal={spreadSignal(t10y2yCur?.value)}
          detail={`The spread between the 10-year and 2-year Treasury yields — the classic recession signal. A sustained inversion (negative reading) has preceded every US recession since the 1970s with a typical lead time of 6–18 months. The curve inverted deeply in 2022–2023, the steepest inversion since 1981. A return to positive territory (re-steepening) can signal either Fed cuts ahead or growth re-acceleration — context matters.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y"
          decimals={3}
        />

        <IndicatorCard
          label="10Y-3M Spread"
          value={t10y3mCur?.value}
          unit="%"
          change={t3mChg}
          changeLabel={bpsLabel(t10y3mCur?.value, t10y3mPrv?.value)}
          direction={directionFromChange(t3mChg)}
          signal={t10y3mSignal(t10y3mCur?.value)}
          detail={`The NY Federal Reserve's preferred recession indicator — used in its widely-cited recession probability model. Academic research (Estrella & Mishkin) shows this spread has the strongest predictive power of any yield curve measure. When inverted, it has preceded all eight US recessions since 1960 with fewer false positives than the 2s10s. An inversion here is considered a high-conviction warning signal by professional forecasters.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y3M"
          decimals={3}
        />

        <IndicatorCard
          label="30Y Mortgage"
          value={mortCur?.value}
          unit="%"
          change={mortChg}
          changeLabel={bpsLabel(mortCur?.value, mortPrv?.value)}
          direction={directionFromChange(mortChg)}
          signal={mortgageSignal(mortCur?.value)}
          detail={`Freddie Mac's weekly 30-year fixed mortgage survey rate — the primary cost of homeownership for most Americans. Tightly linked to the 10Y Treasury yield plus a spread of ~170 bps on average, though that spread widened sharply during the 2022–2023 tightening cycle. Rates above 7% — last seen in the early 2000s — have caused a severe affordability crunch and locked existing homeowners out of moving (the "lock-in effect").`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
          decimals={2}
        />
      </div>

    </div>
  );
}
