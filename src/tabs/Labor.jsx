import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const FETCH = {
  UNRATE: SERIES.UNRATE,
  PAYEMS: SERIES.PAYEMS,
  WAGES:  SERIES.WAGES,
};

function fmtMonthYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTHS[mi]} ${y}` : `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

function chartSlice(arr, n = 24) {
  if (!arr || arr.length === 0) return [];
  return [...arr].slice(0, n).reverse();
}

export default function Labor() {
  const { data, loading, error } = useFredData(FETCH);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  const unrateArr = data.UNRATE || [];
  const payemsArr = data.PAYEMS || [];
  const wagesArr  = data.WAGES  || [];

  const latestUnrate = latest(unrateArr);
  const priorUnrate  = prior(unrateArr, 1);
  const latestPayems = latest(payemsArr);
  const priorPayems  = prior(payemsArr, 1);
  const latestWages  = latest(wagesArr);
  const priorWages   = prior(wagesArr, 1);

  const unrateVal = latestUnrate?.value ?? null;
  const payemsVal = latestPayems?.value ?? null;
  const wagesVal  = latestWages?.value  ?? null;

  const unrateChange = change(unrateVal, priorUnrate?.value);
  const payemsChange = change(payemsVal, priorPayems?.value);
  const wagesChange  = change(wagesVal,  priorWages?.value);

  // Unrate chart header: current + change in pp
  const unratePpChange = unrateVal != null && priorUnrate?.value != null
    ? unrateVal - priorUnrate.value
    : null;
  const unrateDir = unratePpChange == null ? "" : unratePpChange > 0 ? "▲" : "▼";
  const unrateHeaderChange = unratePpChange != null
    ? ` ${unrateDir} ${unratePpChange >= 0 ? "+" : ""}${formatNum(unratePpChange, 1)}pp`
    : "";
  const unrateHeaderColor = unratePpChange == null
    ? "hsl(220,10%,40%)"
    : unratePpChange > 0
    ? "hsl(0,72%,55%)"
    : "hsl(142,70%,55%)";

  // Payems chart header
  const payemsHeaderLabel = payemsVal != null
    ? `${formatNum(payemsVal, 0)}K — ${
        payemsVal < 0
          ? "Job losses — recessionary"
          : payemsVal < 70
          ? "Below breakeven pace"
          : payemsVal < 150
          ? "Solid expansion"
          : "Strong job growth"
      }`
    : "—";

  // Alert banner condition
  const showAlert = (payemsVal != null && payemsVal < 50) || (unrateVal != null && unrateVal > 4.3);
  const alertTitle =
    unrateVal != null && unrateVal > 4.5
      ? "LABOR MARKET DETERIORATION"
      : "LABOR MARKET WEAKENING";
  const alertBody =
    showAlert
      ? `${
          payemsVal != null && payemsVal < 50
            ? `Nonfarm payrolls of ${formatNum(payemsVal, 0)}K are below the ~70K breakeven threshold needed to absorb new entrants to the labor force. `
            : ""
        }${
          unrateVal != null && unrateVal > 4.3
            ? `Unemployment at ${formatNum(unrateVal, 1)}% is above the CBO's long-run natural rate estimate of 4.4%, signaling rising slack in the labor market.`
            : ""
        }`
      : "";

  // Trend job growth estimate from last 3 months
  const recentPayems = payemsArr.slice(0, 3).map((d) => d.value);
  const trendPayems =
    recentPayems.length > 0
      ? recentPayems.reduce((a, b) => a + b, 0) / recentPayems.length
      : null;

  // Narrative paragraphs (dynamic)
  const para1 =
    unrateVal != null && payemsVal != null
      ? `The labor market remains a key source of uncertainty for the macro outlook. With nonfarm payrolls at ${formatNum(payemsVal, 0)}K and the breakeven absorption rate near 70K/month, trend job creation of ${trendPayems != null ? formatNum(trendPayems, 0) + "K" : "~70–100K"} per month is required to keep unemployment from drifting higher. Current readings ${payemsVal >= 70 ? "are tracking above breakeven — consistent with steady employment expansion" : "are tracking below breakeven — a signal of softening labor demand that warrants close monitoring"}.`
      : "Labor market data is currently unavailable. Monitor nonfarm payrolls and unemployment for leading cycle signals.";

  const para2 =
    wagesVal != null
      ? `A key structural risk is the emergence of "jobless growth" — a scenario where AI-driven productivity gains allow firms to grow output without proportional headcount expansion. With AI adoption accelerating across white-collar sectors, labor displacement risk is rising. Average hourly earnings of ${formatNum(wagesVal, 1)}% YoY remain above the ~3% pre-pandemic baseline, but if AI-driven displacement suppresses hiring, wage growth could decelerate sharply even before unemployment rises — making payrolls an early-warning indicator worth watching closely.`
      : `A key structural risk is the emergence of "jobless growth" — a scenario where AI-driven productivity gains allow firms to grow output without proportional headcount expansion. With AI adoption accelerating across white-collar sectors, labor displacement risk is rising even before it is fully visible in aggregate payrolls data.`;

  const para3 =
    wagesVal != null
      ? `Wage growth at ${formatNum(wagesVal, 1)}% YoY is the leading indicator for services inflation. Services CPI — which is 60%+ of core inflation — is largely driven by labor costs. Pre-pandemic wage growth averaged ~3%; the Fed's sustainable ceiling given 2% inflation + ~1.5% productivity growth is approximately 3.5%. ${wagesVal > 3.5 ? "Current wage readings remain above that ceiling, limiting the Fed's ability to ease even if goods disinflation continues." : "Wage growth is converging toward that ceiling, providing the Fed increasing room to adjust policy if labor conditions soften."}`
      : "Wage growth is the leading indicator for services inflation. The Fed monitors average hourly earnings closely, as sustained above-trend wage growth limits its ability to cut rates even if goods disinflation progresses.";

  const axisStyle = {
    fontSize: 9,
    fill: "hsl(220,10%,35%)",
    fontFamily: "JetBrains Mono, monospace",
  };

  const gridStyle = {
    stroke: "hsla(220,15%,20%,0.6)",
    strokeDasharray: "3 3",
    vertical: false,
  };

  // Signal logic for cards
  const unrateSignal =
    unrateVal == null ? "neutral" : unrateVal > 4.5 ? "bearish" : unrateVal < 4.0 ? "bullish" : "neutral";
  const payemsSignal =
    payemsVal == null ? "neutral" : payemsVal < 0 ? "bearish" : payemsVal > 150 ? "bullish" : "neutral";
  const wagesSignal =
    wagesVal == null ? "neutral" : wagesVal > 4.5 ? "bearish" : wagesVal < 3.0 ? "bullish" : "neutral";

  const unrateChart = chartSlice(unrateArr, 24);
  const payemsChart = chartSlice(payemsArr, 24);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Section Header ── */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "hsl(142,70%,55%)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 3,
          }}
        >
          $ LABOR MARKET
        </div>
        <div style={{ fontSize: 10, color: "hsl(220,10%,35%)" }}>
          — Employment, Wages, AI Displacement
        </div>
      </div>

      {/* ── Alert Banner ── */}
      {showAlert && (
        <div
          style={{
            border: "1px solid hsla(0,72%,55%,0.4)",
            background: "hsla(0,72%,55%,0.06)",
            padding: 12,
            borderRadius: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "hsl(0,72%,55%)" }}>⚠</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(0,72%,55%)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {alertTitle}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "hsl(220,10%,50%)", lineHeight: 1.6 }}>
            {alertBody}
          </div>
        </div>
      )}

      {/* ── Charts Side-by-Side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left: Unemployment Rate */}
        <div className="panel">
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(220,10%,35%)", marginBottom: 4 }}>
              Unemployment Rate (%)
            </div>
            {unrateVal != null && (
              <div style={{ fontSize: 14, fontWeight: 600, color: unrateHeaderColor, fontVariantNumeric: "tabular-nums" }}>
                {formatNum(unrateVal, 1)}%
                <span style={{ fontSize: 11, marginLeft: 6, color: unrateHeaderColor }}>
                  {unrateHeaderChange}
                </span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={unrateChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="unrateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor="hsl(0,72%,55%)" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="hsl(0,72%,55%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMonthYear}
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "hsla(220,15%,20%,0.6)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}%`}
                padding={{ top: 8, bottom: 8 }}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${formatNum(v, 1)}%`} />}
              />
              <ReferenceLine
                y={4.4}
                stroke="hsl(45,90%,55%)"
                strokeDasharray="5 3"
                label={{
                  value: "CBO ~4.4%",
                  position: "insideTopRight",
                  fill: "hsl(45,90%,55%)",
                  fontSize: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  dy: -4,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="UNRATE"
                stroke="hsl(0,72%,55%)"
                strokeWidth={2}
                fill="url(#unrateGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "hsl(0,72%,55%)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Nonfarm Payrolls */}
        <div className="panel">
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(220,10%,35%)", marginBottom: 4 }}>
              Nonfarm Payrolls (K/month)
            </div>
            {payemsVal != null && (
              <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(142,70%,55%)", fontVariantNumeric: "tabular-nums" }}>
                {payemsHeaderLabel}
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={payemsChart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="payemsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="15%" stopColor="hsl(142,70%,55%)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="hsl(142,70%,55%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMonthYear}
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "hsla(220,15%,20%,0.6)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}K`}
                padding={{ top: 8, bottom: 8 }}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${formatNum(v, 0)}K`} />}
              />
              <ReferenceLine
                y={0}
                stroke="hsl(0,72%,55%)"
                strokeWidth={1}
              />
              <ReferenceLine
                y={70}
                stroke="hsl(45,90%,55%)"
                strokeDasharray="5 3"
                label={{
                  value: "Breakeven ~70K",
                  position: "insideTopRight",
                  fill: "hsl(45,90%,55%)",
                  fontSize: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  dy: -4,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="PAYEMS"
                stroke="hsl(142,70%,55%)"
                strokeWidth={2}
                fill="url(#payemsGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "hsl(142,70%,55%)" }}
                baseValue={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Narrative Panel ── */}
      <div className="panel">
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(220,10%,35%)", marginBottom: 10 }}>
          Labor Market Structure — The Druckenmiller View
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "hsl(142,70%,55%)", fontSize: 11, flexShrink: 0, marginTop: 1 }}>▸</span>
            <p style={{ fontSize: 10, color: "hsl(220,10%,50%)", lineHeight: 1.7, margin: 0 }}>
              {para1}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "hsl(45,90%,55%)", fontSize: 11, flexShrink: 0, marginTop: 1 }}>▸</span>
            <p style={{ fontSize: 10, color: "hsl(220,10%,50%)", lineHeight: 1.7, margin: 0 }}>
              {para2}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "hsl(185,70%,55%)", fontSize: 11, flexShrink: 0, marginTop: 1 }}>▸</span>
            <p style={{ fontSize: 10, color: "hsl(220,10%,50%)", lineHeight: 1.7, margin: 0 }}>
              {para3}
            </p>
          </div>
        </div>
      </div>

      {/* ── Indicator Cards — row 1: 3 cols ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

        <IndicatorCard
          label="Unemployment Rate"
          value={unrateVal}
          unit="%"
          change={unrateChange}
          decimals={1}
          signal={unrateSignal}
          detail={
            unrateVal != null
              ? `Current unemployment is ${formatNum(unrateVal, 1)}%. The CBO estimates the long-run natural rate (NAIRU) at ~4.4%. ` +
                `${unrateVal > 4.5 ? "Readings above this threshold signal rising slack — historically associated with softening earnings and eventual Fed easing bias." : unrateVal < 4.0 ? "Readings below this threshold signal an overheating labor market that pressures wages and services inflation." : "Current readings are near the NAIRU, consistent with full employment by conventional metrics."} ` +
                `Druckenmiller views the direction of unemployment — not just the level — as the critical cycle signal. Source: BLS via FRED UNRATE.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/UNRATE"
          dateLabel={fmtCardDate(latest(unrateArr)?.date)}
        />

        <IndicatorCard
          label="Nonfarm Payrolls"
          value={payemsVal}
          unit="K"
          change={payemsChange}
          decimals={0}
          signal={payemsSignal}
          detail={
            payemsVal != null
              ? `The economy added ${formatNum(payemsVal, 0)}K jobs last month. Economists estimate ~70K/month is needed to keep up with working-age population growth; sustained readings above 150K signal robust labor demand. ` +
                `${payemsVal < 0 ? "Negative payrolls signal outright job losses — historically a precursor to broader earnings pressure and rising default rates." : payemsVal < 70 ? "Readings below the ~70K breakeven suggest the labor market is absorbing workers slower than the population is growing." : "The current pace is comfortably above the breakeven rate."} ` +
                `Note: initial payroll prints are subject to significant revision. Watch the 3-month average for signal. Source: BLS PAYEMS.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PAYEMS"
          dateLabel={fmtCardDate(latest(payemsArr)?.date)}
        />

        <IndicatorCard
          label="Wage Growth"
          value={wagesVal}
          unit="% YoY"
          change={wagesChange}
          decimals={1}
          signal={wagesSignal}
          detail={
            wagesVal != null
              ? `Average hourly earnings grew ${formatNum(wagesVal, 1)}% year-over-year. ` +
                `Pre-pandemic (2015–2019) wage growth averaged ~3%; readings above 4.5% can sustain services inflation via the wage-price mechanism. ` +
                `The Fed's sustainable nominal wage ceiling given 2% inflation + ~1.5% productivity growth is approximately 3.5%. ` +
                `${wagesVal > 4.5 ? "Current wage growth is inflationary — the primary channel keeping services inflation sticky above the 2% target." : wagesVal < 3.0 ? "Wage growth is cooling toward pre-pandemic levels, easing services inflation pressure and opening room for Fed easing." : "Wage growth is above pre-pandemic norms but moderating — a key variable for the Fed's last-mile inflation battle."} ` +
                `Source: BLS CES0500000003.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CES0500000003"
          dateLabel={fmtCardDate(latest(wagesArr)?.date)}
        />
      </div>

      {/* ── Indicator Cards — row 2: 2 cols ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        <IndicatorCard
          label="AI Labor Displacement"
          value={null}
          unit=""
          changeLabel="Rising Risk"
          signal="bearish"
          detail={
            "AI-driven automation is increasingly displacing white-collar and knowledge-worker roles across technology, finance, legal, and administrative sectors. " +
            "Unlike prior waves of automation (which displaced routine manual labor), generative AI threatens highly-compensated cognitive tasks — " +
            "compressing headcount needs even as economic output grows. This 'jobless growth' dynamic could suppress payrolls and wage growth simultaneously, " +
            "undermining traditional labor market signals used by the Fed. The displacement risk is emerging and not yet fully captured in aggregate employment data."
          }
          source="Structural / Derived"
          dateLabel="Ongoing"
        />

        <IndicatorCard
          label="Breakeven Rate"
          value={null}
          unit=""
          changeLabel={trendPayems != null ? `~${formatNum(trendPayems, 0)}K/mo trend` : "<70K/mo"}
          signal="neutral"
          detail={
            "The labor market breakeven rate — estimated at approximately 70K–100K jobs per month — represents the pace of job creation required to absorb new entrants to the labor force and hold unemployment steady. " +
            "This estimate is derived from BLS labor force participation trends and civilian population growth. " +
            "Monthly payroll readings below this threshold imply rising unemployment over time; readings above it imply continued tightening. " +
            "Note the breakeven shifts with demographic trends: an aging population reduces it; increased immigration raises it."
          }
          source="Derived / BLS"
          sourceUrl="https://fred.stlouisfed.org/series/PAYEMS"
          dateLabel={fmtCardDate(latest(payemsArr)?.date)}
        />
      </div>

    </div>
  );
}
