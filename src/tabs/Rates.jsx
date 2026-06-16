import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import AsOfPill from "../components/AsOfPill";
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
  DGS1MO: SERIES.DGS1MO,
  DGS3MO: SERIES.DGS3MO,
  DGS6MO: SERIES.DGS6MO,
  DGS1: SERIES.DGS1,
  DGS2: SERIES.DGS2,
  DGS3: SERIES.DGS3,
  DGS5: SERIES.DGS5,
  DGS7: SERIES.DGS7,
  DGS10: SERIES.DGS10,
  DGS20: SERIES.DGS20,
  DGS30: SERIES.DGS30,
  FEDFUNDS: SERIES.FEDFUNDS,
  T10Y2Y: SERIES.T10Y2Y,
  T10Y3M: SERIES.T10Y3M,
};

const MATURITIES = [
  { key: "DGS1MO", label: "1M" },
  { key: "DGS3MO", label: "3M" },
  { key: "DGS6MO", label: "6M" },
  { key: "DGS1", label: "1Y" },
  { key: "DGS2", label: "2Y" },
  { key: "DGS3", label: "3Y" },
  { key: "DGS5", label: "5Y" },
  { key: "DGS7", label: "7Y" },
  { key: "DGS10", label: "10Y" },
  { key: "DGS20", label: "20Y" },
  { key: "DGS30", label: "30Y" },
];

const DIM = "hsl(220,10%,35%)";
const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE = "hsl(220,20%,7%)";

const AXIS_TICK = { fontSize: 9, fill: DIM };

// Get value at approximately N trading days ago
function valueAt(series, daysAgo) {
  if (!series || series.length <= daysAgo) return null;
  return series[daysAgo]?.value ?? null;
}

function bpsChange(cur, prev) {
  if (cur == null || prev == null) return null;
  return parseFloat(((cur - prev) * 100).toFixed(1));
}

function bpsColor(bps) {
  if (bps == null) return DIM;
  if (bps < 0) return GREEN; // yield fell = good
  if (bps > 0) return RED; // yield rose = bad
  return DIM;
}

function fmtBps(bps) {
  if (bps == null) return "—";
  return `${bps > 0 ? "+" : ""}${bps.toFixed(0)}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

// ── YIELD CURVE SHAPE (3 lines: Current, 1W Ago, 1M Ago) ──
function YieldCurveShape({ data }) {
  const chartData = MATURITIES.map(({ key, label }) => {
    const series = data[key] || [];
    return {
      maturity: label,
      current: valueAt(series, 0),
      weekAgo: valueAt(series, 5),
      monthAgo: valueAt(series, 22),
    };
  });

  const allVals = chartData.flatMap((d) => [d.current, d.weekAgo, d.monthAgo].filter(Boolean));
  if (allVals.length === 0) return null;
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);

  const latestDate = (() => {
    for (const { key } of MATURITIES) {
      const cur = latest(data[key] || []);
      if (cur) return cur.date;
    }
    return null;
  })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {latestDate ? `As of ${latestDate}` : ""}
          </span>
          <AsOfPill date={latestDate} />
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { color: GREEN, label: "Current" },
            { color: AMBER, label: "1W Ago" },
            { color: RED, label: "1M Ago" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: DIM }}>
              <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
              {label}
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="curveGradGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.20} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis dataKey="maturity" axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <YAxis
            domain={[Math.max(0, minY - 0.2), maxY + 0.2]}
            axisLine={false} tickLine={false} tick={AXIS_TICK}
            tickFormatter={(v) => `${v.toFixed(1)}%`} width={38}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(3)}%` : "—"} />} />
          {/* 1M Ago (back layer) */}
          <Line type="monotone" dataKey="monthAgo" name="1M Ago" stroke={RED} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          {/* 1W Ago */}
          <Line type="monotone" dataKey="weekAgo" name="1W Ago" stroke={AMBER} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          {/* Current (top) */}
          <Area type="monotone" dataKey="current" name="Current" stroke={GREEN} strokeWidth={2} fill="url(#curveGradGreen)" dot={{ r: 3, fill: GREEN, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── YIELD TIME SERIES (4 lines: 2Y, 5Y, 10Y, 30Y) ──
function YieldTimeSeries({ data }) {
  const seriesKeys = [
    { key: "DGS2", field: "y2" },
    { key: "DGS5", field: "y5" },
    { key: "DGS10", field: "y10" },
    { key: "DGS30", field: "y30" },
  ];

  const dateMap = {};
  for (const { key, field } of seriesKeys) {
    const raw = data[key] || [];
    for (const { date, value } of raw) {
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date][field] = value;
    }
  }

  const chartData = Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  if (chartData.length === 0) return null;

  const allVals = chartData.flatMap((d) => [d.y2, d.y5, d.y10, d.y30].filter(Boolean));
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);

  // Derive date range for title
  const first = chartData[0]?.date || "";
  const last = chartData[chartData.length - 1]?.date || "";
  const fmtRange = (d) => {
    if (!d) return "";
    const parts = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtDate} interval="preserveStartEnd" />
          <YAxis domain={[Math.max(0, minY - 0.15), maxY + 0.15]} axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => `${v.toFixed(1)}%`} width={38} />
          <Tooltip content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(3)}%` : "—"} />} />
          <Line type="monotone" dataKey="y2" name="2Y" stroke={CYAN} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="y5" name="5Y" stroke={AMBER} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="y10" name="10Y" stroke={GREEN} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="y30" name="30Y" stroke={RED} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      {/* Legend below chart */}
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        {[
          { color: CYAN, label: "2Y" },
          { color: AMBER, label: "5Y" },
          { color: GREEN, label: "10Y" },
          { color: RED, label: "30Y" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: DIM }}>
            <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Signal helpers ──
function spreadSignal(v) { return v == null ? "neutral" : v < 0 ? "bearish" : v > 0.5 ? "bullish" : "neutral"; }
function t10y3mSignal(v) { return v == null ? "neutral" : v < 0 ? "bearish" : v > 0 ? "bullish" : "neutral"; }
function dir(chg) { return chg == null ? "flat" : chg > 0 ? "up" : chg < 0 ? "down" : "flat"; }
function bpsLabel(cur, prv) {
  if (cur == null || prv == null) return null;
  const b = ((cur - prv) * 100).toFixed(0);
  const n = parseFloat(b);
  return `${n > 0 ? "+" : ""}${b} bps`;
}

function buildSpreadSeries(longSeries, shortSeries) {
  const shortByDate = new Map((shortSeries || []).map((point) => [point.date, point.value]));
  return (longSeries || [])
    .map((point) => {
      const shortValue = shortByDate.get(point.date);
      if (shortValue == null || point.value == null) return null;
      return {
        date: point.date,
        value: point.value - shortValue,
      };
    })
    .filter(Boolean);
}

// ── MAIN ──
export default function Rates() {
  const { data, loading, error } = useFredData(SERIES_MAP);

  if (loading && Object.keys(data).length === 0) return <Loading />;
  if (error) return <div style={{ padding: 24, color: RED, fontSize: 11 }}>ERROR: {error}</div>;

  const ffCur = latest(data.FEDFUNDS || []);
  const ffPrv = prior(data.FEDFUNDS || []);
  const d10Cur = latest(data.DGS10 || []);
  const d10Prv = prior(data.DGS10 || []);
  const d2Cur = latest(data.DGS2 || []);
  const d2Prv = prior(data.DGS2 || []);
  const spread2s10s = buildSpreadSeries(data.DGS10 || [], data.DGS2 || []);
  const t10y2yCur = latest(spread2s10s);
  const t10y2yPrv = prior(spread2s10s);
  const t10y3mCur = latest(data.T10Y3M || []);
  const t10y3mPrv = prior(data.T10Y3M || []);
  const d10Chg = change(d10Cur?.value, d10Prv?.value);
  const d2Chg = change(d2Cur?.value, d2Prv?.value);
  const t2yChg = change(t10y2yCur?.value, t10y2yPrv?.value);
  const t3mChg = change(t10y3mCur?.value, t10y3mPrv?.value);

  // Derive date range for time series title
  const tsData = data.DGS10 || [];
  const oldest = tsData.length > 0 ? tsData[tsData.length - 1]?.date : "";
  const newest = tsData.length > 0 ? tsData[0]?.date : "";
  const fmtPeriod = (d) => {
    if (!d) return "";
    const [y, m] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  const periodLabel = oldest && newest ? `${fmtPeriod(oldest)} TO ${fmtPeriod(newest)}` : "";

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Section Header */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: GREEN }}>$ RATES &amp; YIELD CURVE</span>
        <span style={{ fontSize: 10, color: DIM, marginLeft: 8 }}>— Click any card for analysis</span>
      </div>

      {/* Two charts side-by-side */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Left: U.S. Treasury Yield Curve */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            U.S. Treasury Yield Curve
          </div>
          <YieldCurveShape data={data} />
        </div>

        {/* Right: Yield Time Series */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            YIELD TIME SERIES — {periodLabel}
          </div>
          <YieldTimeSeries data={data} />
        </div>
      </div>

      {/* 5 Indicator Cards */}
      <div className="grid-3">
        <IndicatorCard
          label="Fed Funds Rate"
          value={ffCur?.value}
          unit="%"
          change={change(ffCur?.value, ffPrv?.value)}
          changeLabel={ffCur && ffPrv ? `${bpsLabel(ffCur.value, ffPrv.value)} from ${formatNum(ffPrv.value, 2)}%` : null}
          direction={dir(change(ffCur?.value, ffPrv?.value))}
          signal={ffCur?.value == null || ffPrv?.value == null ? "neutral" : ffCur.value < ffPrv.value ? "bullish" : ffCur.value > ffPrv.value ? "bearish" : "neutral"}
          dateLabel={ffCur?.date ? `${ffCur.date.slice(5)}` : ""}
          detail="The Federal Reserve's target overnight lending rate. Set by the FOMC to balance maximum employment and price stability. After 525 bps of hikes in 2022-2023 — the fastest tightening cycle since the 1980s — the Fed began cutting in late 2024. Rate changes transmit to the entire economy via lending costs, mortgage rates, and bond yields."
          source="Federal Reserve"
          sourceUrl="https://fred.stlouisfed.org/series/FEDFUNDS"
          decimals={2}
          sparkData={data.FEDFUNDS?.slice(0, 12)}
        />
        <IndicatorCard
          label="10Y Treasury Yield"
          value={d10Cur?.value}
          unit="%"
          change={d10Chg}
          changeLabel={d10Cur && d10Prv ? `${bpsLabel(d10Cur.value, d10Prv.value)} from ${formatNum(d10Prv.value, 2)}%` : null}
          direction={dir(d10Chg)}
          signal={d10Chg == null ? "neutral" : d10Chg > 0 ? "bearish" : "neutral"}
          dateLabel={d10Cur?.date?.slice(5) || ""}
          detail="The benchmark long-term interest rate. Used globally to price mortgages, corporate debt, and equity risk premiums. When yields rise sharply — as in 2022-2023 when the 10Y hit 5% for the first time since 2007 — valuations compress across assets."
          source="U.S. Treasury"
          sourceUrl="https://fred.stlouisfed.org/series/DGS10"
          decimals={2}
          sparkData={data.DGS10?.slice(0, 12)}
        />
        <IndicatorCard
          label="2Y Treasury Yield"
          value={d2Cur?.value}
          unit="%"
          change={d2Chg}
          changeLabel={d2Cur && d2Prv ? `${bpsLabel(d2Cur.value, d2Prv.value)} from ${formatNum(d2Prv.value, 2)}%` : null}
          direction={dir(d2Chg)}
          signal={d2Chg == null ? "neutral" : d2Chg > 0 ? "bearish" : "neutral"}
          dateLabel={d2Cur?.date?.slice(5) || ""}
          detail="The most policy-sensitive point on the curve. Closely tracks market expectations for the fed funds rate over the next two years. When the 2Y trades well above the 10Y (inversion), it signals markets expect the Fed to cut as growth deteriorates."
          source="U.S. Treasury"
          sourceUrl="https://fred.stlouisfed.org/series/DGS2"
          decimals={2}
          sparkData={data.DGS2?.slice(0, 12)}
        />
        <IndicatorCard
          label="2s10s Spread"
          value={t10y2yCur?.value != null ? t10y2yCur.value * 100 : null}
          unit=" bps"
          change={t2yChg}
          changeLabel={t10y2yCur && t10y2yPrv ? `${bpsLabel(t10y2yCur.value, t10y2yPrv.value)}` : null}
          direction={dir(t2yChg)}
          signal={spreadSignal(t10y2yCur?.value)}
          dateLabel={t10y2yCur?.date?.slice(5) || ""}
          detail="The spread between 10-year and 2-year Treasury yields — the classic recession signal. A sustained inversion has preceded every US recession since the 1970s with a typical lead time of 6-18 months. The curve inverted deeply in 2022-2023, the steepest since 1981."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y"
          decimals={0}
          prefix="+"
          sparkData={spread2s10s.slice(0, 12)}
        />
        <IndicatorCard
          label="10Y-3M Spread"
          value={t10y3mCur?.value != null ? t10y3mCur.value * 100 : null}
          unit=" bps"
          change={t3mChg}
          changeLabel={t10y3mCur && t10y3mPrv ? `${bpsLabel(t10y3mCur.value, t10y3mPrv.value)}` : null}
          direction={dir(t3mChg)}
          signal={t10y3mSignal(t10y3mCur?.value)}
          dateLabel={t10y3mCur?.date?.slice(5) || ""}
          detail="The NY Fed's preferred recession indicator. Academic research shows this spread has the strongest predictive power of any yield curve measure. An inversion has preceded all eight US recessions since 1960 with fewer false positives than the 2s10s."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y3M"
          decimals={0}
          prefix="+"
          sparkData={data.T10Y3M?.slice(0, 12)}
        />
      </div>
    </div>
  );
}
