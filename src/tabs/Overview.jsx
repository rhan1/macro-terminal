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
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";

const FETCH_SERIES = {
  SP500:      SERIES.SP500,
  NASDAQ:     SERIES.NASDAQ,
  DGS10:      SERIES.DGS10,
  DGS2:       SERIES.DGS2,
  VIXCLS:     SERIES.VIXCLS,
  OIL:        SERIES.OIL,
  GOLD:       SERIES.GOLD,
  FEDFUNDS:   SERIES.FEDFUNDS,
  CPI:        SERIES.CPI,
  COREPCE:    SERIES.COREPCE,
  GDP:        SERIES.GDP,
  UNRATE:     SERIES.UNRATE,
  PAYEMS:     SERIES.PAYEMS,
  MORTGAGE30: SERIES.MORTGAGE30,
  T10Y2Y:     SERIES.T10Y2Y,
  T10Y3M:     SERIES.T10Y3M,
  RECESSION:  SERIES.RECESSION,
};

const TODAY = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function val(data, key) {
  const l = latest(data[key]);
  return l ? l.value : null;
}

function MarketTicker({ label, value, chg, decimals = 2, prefix = "" }) {
  const isPos = chg > 0;
  const isNeg = chg < 0;
  const color = isPos
    ? "var(--color-term-green)"
    : isNeg
    ? "var(--color-term-red)"
    : "var(--color-term-dim)";
  const glowClass = isPos ? "glow-green" : isNeg ? "glow-red" : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 100,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--color-term-dim)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-term-text)",
          letterSpacing: "0.02em",
        }}
      >
        {value != null ? `${prefix}${formatNum(value, decimals)}` : "—"}
      </div>
      <div
        className={glowClass}
        style={{ fontSize: 10, color, fontWeight: 500 }}
      >
        {chg != null ? formatPct(chg) : "—"}
      </div>
    </div>
  );
}

function buildBullets(data) {
  const gdpVal   = val(data, "GDP");
  const cpiVal   = val(data, "CPI");
  const pceVal   = val(data, "COREPCE");
  const unrateVal = val(data, "UNRATE");
  const payemsVal = val(data, "PAYEMS");
  const fedVal   = val(data, "FEDFUNDS");
  const t10Val   = val(data, "DGS10");
  const t2Val    = val(data, "DGS2");
  const t10y2yVal = val(data, "T10Y2Y");
  const t10y3mVal = val(data, "T10Y3M");
  const recVal   = val(data, "RECESSION");
  const vixVal   = val(data, "VIXCLS");

  const bullets = [];

  // GDP
  if (gdpVal != null) {
    const trend = gdpVal >= 2.5
      ? "above-trend expansion"
      : gdpVal >= 0
      ? "below-trend but positive growth"
      : "contraction territory";
    bullets.push(
      `GROWTH: GDP running at ${formatNum(gdpVal)}% annualized — ${trend}. ` +
        (gdpVal < 1 ? "Recessionary risk elevated; watch subsequent quarters." : "Expansion intact but pace warrants monitoring.")
    );
  } else {
    bullets.push("GROWTH: GDP data unavailable from FRED at this time.");
  }

  // Inflation
  if (cpiVal != null || pceVal != null) {
    const inf = cpiVal ?? pceVal;
    const label = cpiVal != null ? "CPI YoY" : "Core PCE";
    const vs = inf > 3.0 ? "well above" : inf > 2.5 ? "above" : inf > 1.5 ? "near" : "below";
    bullets.push(
      `INFLATION: ${label} at ${formatNum(inf)}% — ${vs} the Fed's 2% target. ` +
        (inf > 3.0
          ? "Persistent price pressure limits scope for near-term easing."
          : inf < 2.0
          ? "Disinflation trend gives the Fed room to adjust policy stance."
          : "Inflation tracking toward target; trajectory remains the key variable.")
    );
  } else {
    bullets.push("INFLATION: Inflation data unavailable from FRED at this time.");
  }

  // Labor
  if (unrateVal != null) {
    const laborDesc =
      unrateVal <= 4.0 ? "historically tight" : unrateVal <= 5.0 ? "broadly healthy" : "showing slack";
    const payStr =
      payemsVal != null ? ` Payrolls adding ~${Math.round(payemsVal)}K jobs/month.` : "";
    bullets.push(
      `LABOR: Unemployment at ${formatNum(unrateVal, 1)}% — labor market ${laborDesc}.${payStr} ` +
        (unrateVal > 5.0 ? "Weakening employment may dampen consumer spending." : "Wage-driven demand remains a key upside risk to inflation.")
    );
  } else {
    bullets.push("LABOR: Unemployment data unavailable from FRED at this time.");
  }

  // Rates & yield curve
  if (fedVal != null) {
    const curveStatus =
      t10y2yVal != null && t10y2yVal < 0
        ? `Yield curve inverted (10Y-2Y: ${formatNum(t10y2yVal)}bps) — historically a leading recession signal.`
        : t10y2yVal != null
        ? `Yield curve steepening (10Y-2Y: +${formatNum(t10y2yVal)}bps) — normalization in progress.`
        : "";
    bullets.push(
      `RATES: Fed Funds at ${formatNum(fedVal)}%; 10Y Treasury at ${t10Val != null ? formatNum(t10Val) : "—"}%. ` +
        curveStatus +
        (recVal != null ? ` FRED recession probability: ${formatNum(recVal, 1)}%.` : "")
    );
  } else {
    bullets.push("RATES: Fed Funds rate data unavailable from FRED at this time.");
  }

  return bullets;
}

function SpreadPill({ value }) {
  if (value == null) return <span style={{ color: "var(--color-term-dim)" }}>—</span>;
  const pos = value >= 0;
  return (
    <span
      className={pos ? "glow-green" : "glow-red"}
      style={{
        color: pos ? "var(--color-term-green)" : "var(--color-term-red)",
        fontWeight: 600,
      }}
    >
      {pos ? "+" : ""}{formatNum(value)}%
    </span>
  );
}

export default function Overview() {
  const { data, loading, error } = useFredData(FETCH_SERIES);

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // ---- Market snapshot values ----
  const sp500Latest  = latest(data.SP500);
  const sp500Prior   = prior(data.SP500);
  const nasdaqLatest = latest(data.NASDAQ);
  const nasdaqPrior  = prior(data.NASDAQ);
  const dgs10Latest  = latest(data.DGS10);
  const dgs10Prior   = prior(data.DGS10);
  const dgs2Latest   = latest(data.DGS2);
  const dgs2Prior    = prior(data.DGS2);
  const vixLatest    = latest(data.VIXCLS);
  const vixPrior     = prior(data.VIXCLS);
  const oilLatest    = latest(data.OIL);
  const oilPrior     = prior(data.OIL);
  const goldLatest   = latest(data.GOLD);
  const goldPrior    = prior(data.GOLD);

  const sp500Chg  = change(sp500Latest?.value,  sp500Prior?.value);
  const nasdaqChg = change(nasdaqLatest?.value, nasdaqPrior?.value);
  const dgs10Chg  = change(dgs10Latest?.value,  dgs10Prior?.value);
  const dgs2Chg   = change(dgs2Latest?.value,   dgs2Prior?.value);
  const vixChg    = change(vixLatest?.value,    vixPrior?.value);
  const oilChg    = change(oilLatest?.value,    oilPrior?.value);
  const goldChg   = change(goldLatest?.value,   goldPrior?.value);

  // ---- S&P 500 chart ----
  const spChartData = data.SP500
    ? [...data.SP500].slice(0, 30).reverse().map((d) => ({
        date: d.date.slice(5),  // MM-DD
        value: d.value,
      }))
    : [];

  // ---- Yield curve ----
  const t10y2yVal = val(data, "T10Y2Y");
  const t10y3mVal = val(data, "T10Y3M");
  const dgs10Val  = val(data, "DGS10");
  const dgs2Val   = val(data, "DGS2");

  // ---- IndicatorCard values ----
  const fedVal       = val(data, "FEDFUNDS");
  const fedPriorVal  = prior(data.FEDFUNDS)?.value;
  const fedChg       = change(fedVal, fedPriorVal);

  const cpiVal       = val(data, "CPI");
  const cpiPriorVal  = prior(data.CPI)?.value;
  const cpiChg       = change(cpiVal, cpiPriorVal);

  const gdpVal       = val(data, "GDP");
  const gdpPriorVal  = prior(data.GDP)?.value;
  const gdpChg       = change(gdpVal, gdpPriorVal);

  const unrateVal    = val(data, "UNRATE");
  const unratePrior  = prior(data.UNRATE)?.value;
  const unrateChg    = change(unrateVal, unratePrior);

  const vixVal       = val(data, "VIXCLS");
  const vixCardChg   = change(vixVal, prior(data.VIXCLS)?.value);

  const mortgageVal  = val(data, "MORTGAGE30");
  const mortgagePrior = prior(data.MORTGAGE30)?.value;
  const mortgageChg  = change(mortgageVal, mortgagePrior);

  // ---- Executive summary bullets ----
  const bullets = buildBullets(data);

  // ---- Risk / Opportunity derivations ----
  const recessionProb = val(data, "RECESSION");
  const pceVal        = val(data, "COREPCE");
  const payemsVal     = val(data, "PAYEMS");

  const risks = [];
  const opportunities = [];

  if (t10y2yVal != null && t10y2yVal < 0)
    risks.push(`Inverted yield curve (10Y-2Y ${formatNum(t10y2yVal)}%) — historical recession signal`);
  if (t10y3mVal != null && t10y3mVal < 0)
    risks.push(`10Y-3M spread inverted (${formatNum(t10y3mVal)}%) — additional recession flag`);
  if (cpiVal != null && cpiVal > 3.0)
    risks.push(`Elevated CPI at ${formatNum(cpiVal)}% — restricts Fed policy flexibility`);
  if (vixVal != null && vixVal > 25)
    risks.push(`VIX at ${formatNum(vixVal)} — elevated market fear / volatility regime`);
  if (mortgageVal != null && mortgageVal > 7.0)
    risks.push(`30Y mortgage at ${formatNum(mortgageVal)}% — housing affordability severely stressed`);
  if (gdpVal != null && gdpVal < 0)
    risks.push(`GDP contracted at ${formatNum(gdpVal)}% — watch for consecutive-quarter definition`);
  if (recessionProb != null && recessionProb > 20)
    risks.push(`FRED recession probability at ${formatNum(recessionProb, 1)}% — above threshold`);
  if (risks.length === 0)
    risks.push("No acute systemic risk signals flagged by available FRED data");

  if (gdpVal != null && gdpVal >= 2.5)
    opportunities.push(`Above-trend GDP growth (${formatNum(gdpVal)}%) supports risk asset valuations`);
  if (unrateVal != null && unrateVal <= 4.0)
    opportunities.push(`Tight labor market (${formatNum(unrateVal, 1)}% UNRATE) sustains consumer spending`);
  if (cpiVal != null && cpiVal <= 2.5)
    opportunities.push(`Inflation near target (${formatNum(cpiVal)}%) — potential for rate normalization`);
  if (t10y2yVal != null && t10y2yVal > 0)
    opportunities.push(`Positive yield curve slope — credit expansion environment supportive`);
  if (vixVal != null && vixVal < 18)
    opportunities.push(`Low volatility regime (VIX ${formatNum(vixVal)}) — favorable for risk taking`);
  if (dgs10Val != null && fedVal != null && dgs10Val > fedVal)
    opportunities.push(`Long duration bonds offer ${formatNum(dgs10Val)}% yield vs ${formatNum(fedVal)}% cash — term premium positive`);
  if (opportunities.length === 0)
    opportunities.push("No standout opportunity signals from current FRED data configuration");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px" }}>

      {/* ── MARKET SNAPSHOT BAR ── */}
      <div
        className="panel"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px 28px",
          alignItems: "flex-start",
          padding: "12px 16px",
        }}
      >
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-term-cyan)", alignSelf: "center", minWidth: 90 }}>
          MARKET SNAPSHOT
        </div>
        <MarketTicker label="S&P 500"  value={sp500Latest?.value}  chg={sp500Chg}  decimals={2} />
        <MarketTicker label="NASDAQ"   value={nasdaqLatest?.value} chg={nasdaqChg} decimals={2} />
        <MarketTicker label="10Y TSRY" value={dgs10Latest?.value}  chg={dgs10Chg}  decimals={3} />
        <MarketTicker label="2Y TSRY"  value={dgs2Latest?.value}   chg={dgs2Chg}   decimals={3} />
        <MarketTicker label="VIX"      value={vixLatest?.value}    chg={vixChg}    decimals={2} />
        <MarketTicker label="WTI OIL"  value={oilLatest?.value}    chg={oilChg}    decimals={2} prefix="$" />
        <MarketTicker label="GOLD"     value={goldLatest?.value}   chg={goldChg}   decimals={2} prefix="$" />
      </div>

      {/* ── TOP ROW: Executive Summary + S&P Chart ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* Executive Summary */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--color-term-cyan)",
                fontWeight: 700,
              }}
            >
              MACRO REGIME ANALYSIS
            </div>
            <div style={{ fontSize: 9, color: "var(--color-term-dim)" }}>{TODAY}</div>
          </div>
          <div
            style={{
              height: 1,
              background: "var(--color-term-border)",
              marginBottom: 2,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bullets.map((bullet, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-term-cyan)", flexShrink: 0, marginTop: 1 }}>▸</span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-term-text)",
                    lineHeight: 1.65,
                  }}
                >
                  {bullet}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* S&P 500 Chart */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="section-label" style={{ marginBottom: 0 }}>S&P 500 — LAST 30 SESSIONS</div>
            {sp500Latest && (
              <div style={{ fontSize: 10, color: "var(--color-term-text)" }}>
                {formatNum(sp500Latest.value, 2)}
                {sp500Chg != null && (
                  <span
                    className={sp500Chg >= 0 ? "glow-green" : "glow-red"}
                    style={{
                      marginLeft: 8,
                      color: sp500Chg >= 0 ? "var(--color-term-green)" : "var(--color-term-red)",
                    }}
                  >
                    {formatPct(sp500Chg)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 160 }}>
            <ResponsiveContainer width="100%" height={165}>
              <AreaChart data={spChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--color-term-border)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-term-border)" }}
                  interval={5}
                />
                <YAxis
                  tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 })} />}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="S&P 500"
                  stroke="var(--color-term-green)"
                  strokeWidth={1.5}
                  fill="url(#spGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--color-term-green)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── SECOND ROW: Yield Curve + Risk/Opp ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

        {/* Yield Curve Snapshot */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="section-label">YIELD CURVE SNAPSHOT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Individual yields */}
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid var(--color-term-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 9, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>2Y</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-term-text)" }}>
                  {dgs2Val != null ? `${formatNum(dgs2Val, 3)}%` : "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>10Y</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-term-text)" }}>
                  {dgs10Val != null ? `${formatNum(dgs10Val, 3)}%` : "—"}
                </div>
              </div>
            </div>

            {/* Spreads */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--color-term-dim)" }}>10Y − 2Y SPREAD</span>
                <span style={{ fontSize: 11 }}><SpreadPill value={t10y2yVal} /></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--color-term-dim)" }}>10Y − 3M SPREAD</span>
                <span style={{ fontSize: 11 }}><SpreadPill value={t10y3mVal} /></span>
              </div>
            </div>

            {/* Curve status */}
            <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--color-term-border)" }}>
              {t10y2yVal != null && (
                <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                  {t10y2yVal < 0 ? (
                    <span style={{ color: "var(--color-term-red)" }}>
                      INVERTED — historically precedes recession by 6–18 months. Monitor credit spreads and leading indicators closely.
                    </span>
                  ) : t10y2yVal < 0.5 ? (
                    <span style={{ color: "var(--color-term-amber)" }}>
                      FLAT — curve normalization in progress. Transition phase; direction remains uncertain.
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-term-green)" }}>
                      NORMAL — positive slope supports bank lending and credit creation. Expansion-phase signal.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Risk Panel */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="section-label"
            style={{ color: "var(--color-term-red)", marginBottom: 4 }}
          >
            KEY RISKS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {risks.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-term-red)", flexShrink: 0, fontSize: 10, marginTop: 1 }}>◆</span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Opportunity Panel */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="section-label"
            style={{ color: "var(--color-term-green)", marginBottom: 4 }}
          >
            OPPORTUNITIES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {opportunities.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-term-green)", flexShrink: 0, fontSize: 10, marginTop: 1 }}>◆</span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>{o}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── INDICATOR CARD GRID ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        <IndicatorCard
          label="Fed Funds"
          value={fedVal}
          unit="%"
          change={fedChg}
          decimals={2}
          detail={
            fedVal != null
              ? `Federal funds effective rate. Current stance: ${fedVal >= 5 ? "restrictive" : fedVal >= 3 ? "neutral-to-tight" : "accommodative"}. Prior reading: ${formatNum(fedPriorVal)}%.`
              : "Fed Funds data unavailable."
          }
          source="FRED / DFF"
          sourceUrl="https://fred.stlouisfed.org/series/DFF"
        />
        <IndicatorCard
          label="CPI YoY"
          value={cpiVal}
          unit="%"
          change={cpiChg}
          decimals={2}
          detail={
            cpiVal != null
              ? `Consumer Price Index, all items, year-over-year % change. Fed target: 2.0%. Current gap: ${formatNum(cpiVal - 2.0)}pp. Prior: ${formatNum(cpiPriorVal)}%.`
              : "CPI data unavailable."
          }
          source="FRED / CPIAUCSL"
          sourceUrl="https://fred.stlouisfed.org/series/CPIAUCSL"
        />
        <IndicatorCard
          label="GDP Growth"
          value={gdpVal}
          unit="%"
          change={gdpChg}
          decimals={1}
          detail={
            gdpVal != null
              ? `Real GDP growth, annualized quarter-over-quarter. Prior quarter: ${formatNum(gdpPriorVal, 1)}%. Two consecutive negative quarters = technical recession.`
              : "GDP data unavailable."
          }
          source="FRED / A191RL1Q225SBEA"
          sourceUrl="https://fred.stlouisfed.org/series/A191RL1Q225SBEA"
        />
        <IndicatorCard
          label="Unemployment"
          value={unrateVal}
          unit="%"
          change={unrateChg}
          decimals={1}
          detail={
            unrateVal != null
              ? `Civilian unemployment rate. Natural rate ~4.0–4.5%. ${unrateVal <= 4.0 ? "Below natural rate — labor market tight." : unrateVal <= 5.0 ? "Near natural rate — balanced conditions." : "Above natural rate — labor market slack."} Prior: ${formatNum(unratePrior, 1)}%.`
              : "Unemployment data unavailable."
          }
          source="FRED / UNRATE"
          sourceUrl="https://fred.stlouisfed.org/series/UNRATE"
        />
        <IndicatorCard
          label="VIX"
          value={vixVal}
          unit=""
          change={vixCardChg}
          decimals={2}
          detail={
            vixVal != null
              ? `CBOE Volatility Index. Fear gauge: <15 complacent, 15–25 normal, 25–35 elevated, >35 crisis. Current regime: ${vixVal < 15 ? "COMPLACENT" : vixVal < 25 ? "NORMAL" : vixVal < 35 ? "ELEVATED" : "CRISIS"}.`
              : "VIX data unavailable."
          }
          source="FRED / VIXCLS"
          sourceUrl="https://fred.stlouisfed.org/series/VIXCLS"
        />
        <IndicatorCard
          label="30Y Mortgage"
          value={mortgageVal}
          unit="%"
          change={mortgageChg}
          decimals={2}
          detail={
            mortgageVal != null
              ? `30-year fixed mortgage rate. Prior: ${formatNum(mortgagePrior)}%. Spread to 10Y Treasury: ${dgs10Val != null ? formatNum(mortgageVal - dgs10Val) : "—"}pp. ${mortgageVal > 7.0 ? "Severely constraining housing affordability." : mortgageVal > 5.5 ? "Housing affordability under pressure." : "Rates manageable for qualified borrowers."}`
              : "Mortgage rate data unavailable."
          }
          source="FRED / MORTGAGE30US"
          sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
        />
      </div>
    </div>
  );
}
