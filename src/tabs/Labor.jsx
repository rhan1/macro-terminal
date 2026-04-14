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
  UNRATE:   SERIES.UNRATE,
  PAYEMS:   SERIES.PAYEMS,
  WAGES:    SERIES.WAGES,
  CLAIMS:   SERIES.CLAIMS,
  BREAKEVEN: SERIES.BREAKEVEN,
  CPI:      SERIES.CPI,
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
  const wages = data.WAGES;
  const cpi = data.CPI;

  const latestUnrate = latest(unrate)?.value;
  const priorUnrate = prior(unrate, 3)?.value;
  const latestPayems = latest(payems)?.value;
  const latestWages = latest(wages)?.value;
  const latestCpi = latest(cpi)?.value;

  const sentences = [];

  // Unemployment trend
  if (latestUnrate != null) {
    const vsNatural = latestUnrate - 4.4;
    const trend = priorUnrate != null
      ? latestUnrate < priorUnrate
        ? "tightening"
        : latestUnrate > priorUnrate
        ? "easing"
        : "stable"
      : null;
    const trendStr = trend ? ` and trending ${trend}` : "";
    const relStr =
      vsNatural < -0.3
        ? "below the CBO natural rate of 4.4%, signaling a tight labor market"
        : vsNatural > 0.3
        ? "above the CBO natural rate of 4.4%, suggesting slack in the labor market"
        : "near the CBO estimated natural rate of 4.4%";
    sentences.push(
      `Unemployment stands at ${formatNum(latestUnrate, 1)}%${trendStr}, ${relStr}.`
    );
  }

  // Payrolls strength
  if (latestPayems != null) {
    const strength =
      latestPayems > 250
        ? "well above the ~100K breakeven needed to absorb new labor force entrants, indicating robust job creation"
        : latestPayems > 100
        ? "above the ~100K population breakeven, pointing to continued labor market expansion"
        : latestPayems > 0
        ? "below the ~100K population breakeven, suggesting labor market momentum is slowing"
        : "negative, indicating outright job losses";
    sentences.push(
      `Nonfarm payrolls added ${formatNum(latestPayems, 0)}K jobs last month, ${strength}.`
    );
  }

  // Wage growth vs inflation
  if (latestWages != null) {
    if (latestCpi != null) {
      const realWages = latestWages - latestCpi;
      const realStr =
        realWages > 0
          ? `implying real wage growth of +${formatNum(realWages, 1)}pp above headline CPI`
          : `implying real wage erosion of ${formatNum(realWages, 1)}pp relative to headline CPI`;
      sentences.push(
        `Average hourly earnings are up ${formatNum(latestWages, 1)}% YoY, ${realStr}.`
      );
    } else {
      const wageStr =
        latestWages > 4.5
          ? "elevated, keeping inflation pressure in services"
          : latestWages > 3.0
          ? "moderating but still above pre-pandemic norms"
          : "cooling toward pre-pandemic levels";
      sentences.push(
        `Average hourly earnings growth of ${formatNum(latestWages, 1)}% YoY is ${wageStr}.`
      );
    }
  }

  // Claims context
  const claimsVal = latest(data.CLAIMS)?.value;
  if (claimsVal != null) {
    const claimsK = claimsVal / 1000;
    const claimsStr =
      claimsK < 220
        ? "low, consistent with historically tight labor conditions"
        : claimsK < 280
        ? "within the normal range, not signaling imminent deterioration"
        : "elevated, warranting close monitoring as a leading recession indicator";
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
  const latestUnrate   = latest(data.UNRATE);
  const priorUnrate    = prior(data.UNRATE, 1);
  const latestPayems   = latest(data.PAYEMS);
  const priorPayems    = prior(data.PAYEMS, 1);
  const latestWages    = latest(data.WAGES);
  const priorWages     = prior(data.WAGES, 1);
  const latestClaims   = latest(data.CLAIMS);
  const priorClaims    = prior(data.CLAIMS, 1);
  const latestBreakeven = latest(data.BREAKEVEN);

  // Changes (absolute pp for rates, % change for claims)
  const unrateChange   = latestUnrate && priorUnrate
    ? latestUnrate.value - priorUnrate.value
    : null;
  const payemsChange   = latestPayems && priorPayems
    ? latestPayems.value - priorPayems.value
    : null;
  const wagesChange    = latestWages && priorWages
    ? latestWages.value - priorWages.value
    : null;
  const claimsChangePct = latestClaims && priorClaims && priorClaims.value !== 0
    ? ((latestClaims.value - priorClaims.value) / Math.abs(priorClaims.value)) * 100
    : null;

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

      {/* ── Top charts row ── */}
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
              <ReferenceLine
                y={0}
                stroke="var(--color-term-dim)"
                strokeWidth={1}
              />
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
              {/* Positive area (above 0) */}
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

      {/* ── Labor Analysis ── */}
      <div className="panel">
        <div className="section-label">LABOR MARKET ANALYSIS</div>
        <p
          style={{
            fontSize: 10,
            color: "var(--color-term-text)",
            lineHeight: 1.7,
            opacity: 0.85,
          }}
        >
          {analysisText}
        </p>
      </div>

      {/* ── Indicator Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
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
              ? `Current unemployment is ${formatNum(latestUnrate.value, 1)}%. The CBO estimates the long-run natural rate at ~4.4%. Readings below this level often indicate an overheating labor market. Data: BLS via FRED UNRATE.`
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
              ? `The economy added ${formatNum(latestPayems.value, 0)}K jobs last month. Economists estimate ~100K/month is needed to keep up with population growth. Sustained readings above 200K signal strong labor demand. Source: BLS PAYEMS.`
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
              ? `Average hourly earnings grew ${formatNum(latestWages.value, 1)}% year-over-year. Wage growth above 3.5–4% can sustain inflationary pressure via services prices. Real wage growth = wage growth minus CPI. Source: BLS CES0500000003.`
              : undefined
          }
          source="BLS / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CES0500000003"
        />

        {/* Initial Claims */}
        <IndicatorCard
          label="Initial Claims"
          value={latestClaims?.value != null ? latestClaims.value / 1000 : null}
          unit="K"
          change={claimsChangePct}
          decimals={0}
          detail={
            latestClaims
              ? `Initial jobless claims are a leading labor market indicator. ${formatNum(latestClaims.value / 1000, 0)}K claims filed last week. Readings consistently above 300K often precede broader economic weakness. Source: DOL ICSA.`
              : undefined
          }
          source="DOL / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/ICSA"
        />

        {/* Breakeven Rate */}
        <IndicatorCard
          label="10Y Breakeven"
          value={latestBreakeven?.value ?? null}
          unit="%"
          change={null}
          decimals={2}
          detail={
            latestBreakeven
              ? `The 10-year breakeven inflation rate of ${formatNum(latestBreakeven.value, 2)}% reflects bond market expectations for average inflation over the next decade. It is derived from the spread between nominal Treasuries and TIPS. A breakeven above 2.5% suggests markets doubt the Fed can deliver on its 2% target. Source: FRED T10YIE.`
              : undefined
          }
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/T10YIE"
        />
      </div>
    </div>
  );
}
