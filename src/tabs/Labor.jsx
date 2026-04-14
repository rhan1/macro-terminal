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
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";

const FETCH = {
  UNRATE:    SERIES.UNRATE,
  PAYEMS:    SERIES.PAYEMS,
  WAGES:     SERIES.WAGES,
  CLAIMS:    SERIES.CLAIMS,
  BREAKEVEN: SERIES.BREAKEVEN,
  CPI:       SERIES.CPI,
};

function fmtMonthYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function chartSlice(arr, n = 24) {
  if (!arr || arr.length === 0) return [];
  return [...arr].slice(0, n).reverse();
}

function buildAnalysis(data) {
  const unrate = data.UNRATE;
  const payems = data.PAYEMS;
  const wages  = data.WAGES;
  const cpi    = data.CPI;

  const latestUnrate  = latest(unrate)?.value;
  const priorUnrate   = prior(unrate, 3)?.value;  // 3-month trend
  const latestPayems  = latest(payems)?.value;
  const latestWages   = latest(wages)?.value;
  const latestCpi     = latest(cpi)?.value;
  const claimsVal     = latest(data.CLAIMS)?.value;

  const sentences = [];

  // Druckenmiller context: labor is the leading indicator for earnings and Fed policy
  sentences.push(
    "Stanley Druckenmiller has long argued that labor market conditions are the single most important leading indicator " +
    "for corporate earnings, credit quality, and ultimately equity markets — the direction of employment tells you more " +
    "about the cycle than any coincident GDP print."
  );

  // Unemployment trend
  if (latestUnrate != null) {
    const vsNatural = latestUnrate - 4.4;
    const trend =
      priorUnrate != null
        ? latestUnrate < priorUnrate
          ? "tightening"
          : latestUnrate > priorUnrate
          ? "easing"
          : "stable"
        : null;
    const trendStr = trend ? ` and the 3-month trend is ${trend}` : "";
    const relStr =
      vsNatural < -0.3
        ? "well below the CBO long-run natural rate of 4.4% — historically associated with an overheating labor market, " +
          "upward wage pressure, and a Fed biased toward tightening"
        : vsNatural > 0.3
        ? "above the CBO natural rate of 4.4%, implying meaningful slack — conditions that historically correspond to " +
          "disinflation and eventual easing bias"
        : "near the CBO estimated long-run natural rate of 4.4%, consistent with full employment by conventional metrics";
    sentences.push(
      `Unemployment stands at ${formatNum(latestUnrate, 1)}%${trendStr}, ${relStr}.`
    );
  }

  // Payrolls
  if (latestPayems != null) {
    const strength =
      latestPayems > 250
        ? "well above the ~100K breakeven needed to absorb new labor force entrants. " +
          "Readings at this level historically coincide with tightening financial conditions and Fed caution"
        : latestPayems > 100
        ? "above the ~100K population breakeven, pointing to continued expansion — but markets will scrutinize " +
          "whether this pace is sustainable without reigniting wage inflation"
        : latestPayems > 0
        ? "below the ~100K population breakeven. Momentum is softening; watch for upward drift in claims " +
          "and downward revisions as confirming signals"
        : "negative — outright job losses that historically precede broader earnings pressure and rising default rates";
    sentences.push(
      `Nonfarm payrolls added ${formatNum(latestPayems, 0)}K jobs last month, ${strength}.`
    );
  }

  // Wage growth vs. inflation
  if (latestWages != null) {
    if (latestCpi != null) {
      const realWages = latestWages - latestCpi;
      const realStr =
        realWages > 0
          ? `implying real wage growth of +${formatNum(realWages, 1)}pp — positive for consumption but a sticky-inflation risk the Fed watches closely`
          : `implying real wage erosion of ${formatNum(realWages, 1)}pp relative to headline CPI — a headwind for consumer spending that historically feeds into softer retail sales`;
      sentences.push(
        `Average hourly earnings are up ${formatNum(latestWages, 1)}% YoY, ${realStr}. ` +
        `Pre-pandemic (2015–2019) wage growth averaged ~3%, so current readings ${latestWages > 4 ? "remain elevated above that baseline" : "are converging back toward pre-pandemic norms"}.`
      );
    } else {
      const wageStr =
        latestWages > 4.5
          ? "elevated — the primary channel keeping services inflation sticky above 2% target"
          : latestWages > 3.0
          ? "moderating but still above the 2015–2019 pre-pandemic norm of ~3%, sustaining services disinflation pressure"
          : "cooling toward pre-pandemic levels, which would ease services inflation and shift Fed rhetoric toward easing";
      sentences.push(
        `Average hourly earnings growth of ${formatNum(latestWages, 1)}% YoY is ${wageStr}.`
      );
    }
  }

  // Claims context — a true leading indicator
  if (claimsVal != null) {
    const claimsK = claimsVal / 1000;
    const claimsStr =
      claimsK < 220
        ? "historically low — consistent with the tightest labor conditions since the 1960s and a Fed that has limited room to cut"
        : claimsK < 280
        ? "within the normal cyclical range. No imminent deterioration signal, but trend direction matters more than the level at this stage"
        : claimsK < 350
        ? "elevated and warrant monitoring. Sustained readings above 300K have historically preceded broader layoff waves within 3–6 months"
        : "at recessionary levels — consistent with rapid labor market deterioration. Historically this range coincides with equity drawdowns exceeding 20%";
    sentences.push(
      `Initial jobless claims at ${formatNum(claimsK, 0)}K are ${claimsStr}.`
    );
  }

  return sentences.join(" ") || "Insufficient data to generate analysis.";
}

export default function Labor() {
  const { data, loading, error } = useFredData(FETCH);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Chart data
  const unrateChart = chartSlice(data.UNRATE, 24);
  const payemsChart = chartSlice(data.PAYEMS, 24);

  // Latest values
  const latestUnrate    = latest(data.UNRATE);
  const priorUnrate     = prior(data.UNRATE, 1);
  const latestPayems    = latest(data.PAYEMS);
  const priorPayems     = prior(data.PAYEMS, 1);
  const latestWages     = latest(data.WAGES);
  const priorWages      = prior(data.WAGES, 1);
  const latestClaims    = latest(data.CLAIMS);
  const priorClaims     = prior(data.CLAIMS, 1);
  const latestBreakeven = latest(data.BREAKEVEN);
  const priorBreakeven  = prior(data.BREAKEVEN, 1);

  // All change values use change() for percentage — IndicatorCard renders with formatPct()
  // For UNRATE and WAGES (already %-valued series), change() gives % change of the rate itself,
  // which is semantically valid (e.g., UNRATE moved from 4.0 → 4.2 = +5% change of the metric).
  const unrateChange    = change(latestUnrate?.value, priorUnrate?.value);
  const payemsChange    = change(latestPayems?.value, priorPayems?.value);
  const wagesChange     = change(latestWages?.value, priorWages?.value);
  const claimsChange    = change(latestClaims?.value, priorClaims?.value);
  const breakevenChange = change(latestBreakeven?.value, priorBreakeven?.value);

  const analysisText = buildAnalysis(data);

  const axisStyle = {
    fontSize: 9,
    fill: "var(--color-term-dim)",
    fontFamily: "JetBrains Mono, monospace",
  };

  const gridStyle = {
    stroke: "var(--color-term-border)",
    strokeDasharray: "3 3",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Unemployment Rate Chart */}
        <div className="panel">
          <div className="section-label">UNEMPLOYMENT RATE (UNRATE) — LAST 24 MONTHS</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={unrateChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="unrateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMonthYear}
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${formatNum(v, 1)}%`} />}
              />
              <ReferenceLine
                y={4.4}
                stroke="var(--color-term-amber)"
                strokeDasharray="5 3"
                label={{
                  value: "NATURAL RATE ~4.4%",
                  position: "insideTopRight",
                  fill: "var(--color-term-amber)",
                  fontSize: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  dy: -4,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="UNRATE"
                stroke="var(--color-term-green)"
                strokeWidth={1.5}
                fill="url(#unrateGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-green)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Nonfarm Payrolls Chart */}
        <div className="panel">
          <div className="section-label">NONFARM PAYROLLS MOM CHANGE (PAYEMS) — LAST 24 MONTHS</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={payemsChart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="payemsGreenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="payemsRedGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="5%"  stopColor="var(--color-term-red)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-term-red)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMonthYear}
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}K`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${formatNum(v, 0)}K`} />}
              />
              <ReferenceLine y={0} stroke="var(--color-term-dim)" strokeWidth={1} />
              <ReferenceLine
                y={100}
                stroke="var(--color-term-amber)"
                strokeDasharray="5 3"
                label={{
                  value: "BREAKEVEN ~100K",
                  position: "insideTopRight",
                  fill: "var(--color-term-amber)",
                  fontSize: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  dy: -4,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="PAYEMS"
                stroke="var(--color-term-green)"
                strokeWidth={1.5}
                fill="url(#payemsGreenGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-green)" }}
                baseValue={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Labor Analysis */}
      <div className="panel">
        <div className="section-label">LABOR MARKET ANALYSIS</div>
        <p
          style={{
            fontSize: 10,
            color: "var(--color-term-text)",
            lineHeight: 1.75,
            opacity: 0.9,
          }}
        >
          {analysisText}
        </p>
      </div>

      {/* Indicator Cards — 3 columns row 1, 2 columns row 2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
        }}
      >
        {/* Unemployment Rate */}
        <IndicatorCard
          label="Unemployment Rate"
          value={latestUnrate?.value ?? null}
          unit="%"
          change={unrateChange}
          decimals={1}
          detail={
            latestUnrate
              ? `Current unemployment is ${formatNum(latestUnrate.value, 1)}%. The CBO estimates the long-run natural rate (NAIRU) at ~4.4%. ` +
                `Readings below this threshold signal an overheating labor market that historically pressures wages and services inflation. ` +
                `Druckenmiller views unemployment direction — not level — as the critical signal: a rising rate, even from low levels, often foreshadows a turn in the credit cycle. ` +
                `The last time UNRATE rose >1pp from trough was 2007–2008, preceding the GFC. Data: BLS via FRED UNRATE.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/UNRATE"
        />

        {/* Nonfarm Payrolls */}
        <IndicatorCard
          label="Nonfarm Payrolls"
          value={latestPayems?.value != null ? latestPayems.value : null}
          unit="K"
          change={payemsChange}
          decimals={0}
          detail={
            latestPayems
              ? `The economy added ${formatNum(latestPayems.value, 0)}K jobs last month. Economists estimate ~100K/month is needed to keep up with working-age population growth; ` +
                `sustained readings above 200K signal robust labor demand. The change shown is the month-over-month % move in payroll growth — ` +
                `a deceleration from strong prior months is often more important than the absolute level. ` +
                `Note: initial payroll prints are heavily revised. Watch 3-month average for signal. Source: BLS PAYEMS.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/PAYEMS"
        />

        {/* Wage Growth */}
        <IndicatorCard
          label="Wage Growth"
          value={latestWages?.value ?? null}
          unit="% YoY"
          change={wagesChange}
          decimals={1}
          detail={
            latestWages
              ? `Average hourly earnings grew ${formatNum(latestWages.value, 1)}% year-over-year. ` +
                `Pre-pandemic (2015–2019) wage growth averaged ~3%; readings above 4% can sustain services inflation via the wage-price mechanism. ` +
                `The Fed targets real wage growth consistent with 2% inflation + trend productivity (~1.5%), implying a sustainable nominal ceiling near 3.5%. ` +
                `Wage growth above that level limits the Fed's ability to cut rates even if goods disinflation continues. Source: BLS CES0500000003.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CES0500000003"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {/* Initial Claims */}
        <IndicatorCard
          label="Initial Claims"
          value={latestClaims?.value != null ? latestClaims.value / 1000 : null}
          unit="K"
          change={claimsChange}
          decimals={0}
          detail={
            latestClaims
              ? `Initial jobless claims are the most timely leading labor market indicator — published weekly with a 5-day lag. ` +
                `${formatNum(latestClaims.value / 1000, 0)}K claims filed last week. ` +
                `Readings consistently below 250K signal a historically tight labor market. ` +
                `Sustained readings above 300K have historically preceded broader economic weakness within 1–2 quarters; above 400K is recessionary. ` +
                `Claims are also a key input to the Sahm Rule — a recession signal triggered when the 3-month average unemployment rate rises 0.5pp above its prior-year low. Source: DOL ICSA.`
              : undefined
          }
          source="DOL / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/ICSA"
        />

        {/* 10Y Breakeven */}
        <IndicatorCard
          label="10Y Breakeven Inflation"
          value={latestBreakeven?.value ?? null}
          unit="%"
          change={breakevenChange}
          decimals={2}
          detail={
            latestBreakeven
              ? `The 10-year breakeven inflation rate of ${formatNum(latestBreakeven.value, 2)}% reflects bond market expectations for average CPI over the next decade, ` +
                `derived from the spread between nominal 10Y Treasuries and 10Y TIPS. ` +
                `A breakeven above 2.5% signals markets doubt the Fed can sustainably deliver on its 2% mandate — historically a constraint on equity multiples. ` +
                `Below 2.0% suggests deflationary risk or aggressive forward guidance credibility. ` +
                `Included here because labor market tightness is the primary driver of medium-term inflation expectations. Source: FRED T10YIE.`
              : undefined
          }
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10YIE"
        />
      </div>

    </div>
  );
}
