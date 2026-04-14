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

// ── Macro Regime Determination ──────────────────────────────────────────────
function getMacroRegime(cpi, gdp, vix) {
  if (vix != null && vix > 30) return { label: "CRISIS MODE", color: "var(--color-term-red)" };
  if (gdp != null && gdp < 0) return { label: "RECESSION", color: "var(--color-term-red)" };
  if (cpi != null && gdp != null && cpi > 3 && gdp < 1.5) return { label: "STAGFLATION RISK", color: "var(--color-term-amber)" };
  if (cpi != null && gdp != null && cpi > 3 && gdp > 2) return { label: "OVERHEATING", color: "var(--color-term-amber)" };
  if (cpi != null && gdp != null && cpi < 2.5 && gdp > 2) return { label: "GOLDILOCKS", color: "var(--color-term-green)" };
  return { label: "LATE CYCLE EXPANSION", color: "var(--color-term-cyan)" };
}

// ── Upcoming Events Calendar ─────────────────────────────────────────────────
function getUpcomingEvents() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  // Compute next occurrence of a day-of-month target, jumping to next month if already past + offset
  function nextOccurrence(dayOfMonth, offsetDays = 0) {
    let d = new Date(y, m, dayOfMonth);
    d.setDate(d.getDate() + offsetDays);
    if (d <= now) {
      d = new Date(y, m + 1, dayOfMonth);
      d.setDate(d.getDate() + offsetDays);
    }
    return d;
  }

  // First Friday of a given month/year
  function firstFriday(yr, mo) {
    const d = new Date(yr, mo, 1);
    const dow = d.getDay(); // 0=Sun
    const daysUntilFri = (5 - dow + 7) % 7;
    d.setDate(1 + daysUntilFri);
    return d;
  }

  function nextFirstFriday() {
    let d = firstFriday(y, m);
    if (d <= now) d = firstFriday(y, m + 1);
    return d;
  }

  // FOMC meetings: roughly every 6 weeks, approximate next from known 2025 schedule
  // We'll derive from a known base date and step forward by 42 days until > now
  function nextFOMC() {
    const base = new Date(2025, 0, 29); // Jan 29 2025
    let d = new Date(base);
    while (d <= now) d.setDate(d.getDate() + 42);
    return d;
  }

  // GDP estimate: last week of month/quarter (end-of-quarter months: Mar=2, Jun=5, Sep=8, Dec=11)
  function nextGDP() {
    const quarterEnds = [2, 5, 8, 11]; // 0-indexed months
    for (const mo of quarterEnds) {
      // Advance release ~28th of month following quarter end (advance estimate)
      const releaseMonth = (mo + 1) % 12;
      const releaseYear = mo === 11 ? y + 1 : y;
      const d = new Date(releaseYear, releaseMonth, 28);
      if (d > now) return d;
    }
    return new Date(y + 1, 1, 28);
  }

  // PCE: released last Friday of month (approximate as 28th–31st, use 28th)
  function nextPCE() {
    let d = new Date(y, m, 28);
    if (d <= now) d = new Date(y, m + 1, 28);
    return d;
  }

  const fmt = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const cpiDate   = nextOccurrence(12);      // ~10th–13th; use 12
  const ppiDate   = nextOccurrence(13);      // day after CPI
  const fomcDate  = nextFOMC();
  const jobsDate  = nextFirstFriday();
  const gdpDate   = nextGDP();
  const pceDate   = nextPCE();

  // Sort by date
  const events = [
    { name: "CPI Report",        date: cpiDate,  desc: "Consumer Price Index, all items YoY" },
    { name: "PPI Release",       date: ppiDate,  desc: "Producer Price Index, final demand" },
    { name: "FOMC Decision",     date: fomcDate, desc: "Federal Open Market Committee rate decision" },
    { name: "Jobs Report",       date: jobsDate, desc: "Nonfarm Payrolls + Unemployment Rate" },
    { name: "GDP Advance Est.",  date: gdpDate,  desc: "Real GDP QoQ annualized, advance release" },
    { name: "PCE Deflator",      date: pceDate,  desc: "Personal Consumption Expenditures price index" },
  ].sort((a, b) => a.date - b.date);

  return events.map((e) => ({
    ...e,
    dateStr: fmt(e.date),
    daysOut: Math.ceil((e.date - now) / 86400000),
  }));
}

// ── Analytical Bullets ───────────────────────────────────────────────────────
function buildBullets(data) {
  const gdpVal    = val(data, "GDP");
  const gdpPrior  = prior(data.GDP)?.value;
  const cpiVal    = val(data, "CPI");
  const pceVal    = val(data, "COREPCE");
  const unrateVal = val(data, "UNRATE");
  const payemsVal = val(data, "PAYEMS");
  const fedVal    = val(data, "FEDFUNDS");
  const t10Val    = val(data, "DGS10");
  const t10y2yVal = val(data, "T10Y2Y");
  const t10y3mVal = val(data, "T10Y3M");
  const recVal    = val(data, "RECESSION");
  const vixVal    = val(data, "VIXCLS");

  const bullets = [];

  // GROWTH
  if (gdpVal != null) {
    const trend =
      gdpVal >= 3.0 ? "well above long-run potential (~2%)" :
      gdpVal >= 2.0 ? "at or above trend — expansion intact" :
      gdpVal >= 0.5 ? "below trend — stall-speed risk elevated" :
      gdpVal >= 0   ? "near-stall — contraction imminent if sustained" :
                      "contraction — technical recession criteria approaching";
    const momentum =
      gdpPrior != null
        ? gdpVal > gdpPrior
          ? `Momentum accelerating from prior ${formatNum(gdpPrior, 1)}%.`
          : gdpVal < gdpPrior
          ? `Momentum decelerating from prior ${formatNum(gdpPrior, 1)}% — trajectory warrants close monitoring.`
          : `Steady vs prior ${formatNum(gdpPrior, 1)}%.`
        : "";
    bullets.push(
      `GROWTH: Real GDP at ${formatNum(gdpVal, 1)}% annualized — ${trend}. ${momentum} ` +
      `Druckenmiller framework: growth velocity determines the risk-asset regime; ` +
      `${gdpVal < 1 ? "sub-1% demands underweight equities / overweight defensives." : gdpVal >= 2.5 ? "above-trend supports cyclical overweight." : "mid-cycle pace favors selective quality exposure."}`
    );
  } else {
    bullets.push("GROWTH: GDP data unavailable from FRED. Cannot assess growth regime.");
  }

  // INFLATION
  if (cpiVal != null || pceVal != null) {
    const inf   = cpiVal ?? pceVal;
    const lbl   = cpiVal != null ? "CPI YoY" : "Core PCE";
    const gap   = inf - 2.0;
    const gapStr = gap > 0 ? `+${formatNum(gap, 1)}pp above` : `${formatNum(gap, 1)}pp below`;
    const stance =
      inf > 4.0 ? "Fed under pressure — rate cuts off the table until material disinflation" :
      inf > 3.0 ? "Still restrictive Fed posture required; policy pivot premature" :
      inf > 2.5 ? "Disinflation progressing but last mile historically sticky" :
      inf > 1.5 ? "On-target; Fed has optionality — cuts possible without credibility loss" :
                  "Below target — disinflationary forces dominant; easing bias warranted";
    bullets.push(
      `INFLATION: ${lbl} at ${formatNum(inf, 2)}% — ${gapStr} the 2% Federal Reserve target. ` +
      `${stance}. Core PCE${pceVal != null ? ` at ${formatNum(pceVal, 2)}%` : " unavailable"} is the Fed's preferred gauge. ` +
      `Historical context: post-GFC inflation averaged 1.7%; 2022 peak was 9.1% — current level ` +
      `${inf > 3 ? "remains uncomfortably elevated" : "represents meaningful normalization"}.`
    );
  } else {
    bullets.push("INFLATION: Inflation data unavailable from FRED at this time.");
  }

  // LABOR
  if (unrateVal != null) {
    const nairu   = 4.2; // CBO natural rate estimate
    const gap     = unrateVal - nairu;
    const slack   =
      gap < -0.5 ? `${formatNum(Math.abs(gap), 1)}pp below NAIRU — wage pressure embedded` :
      gap < 0.3  ? "near NAIRU — labor market in balance" :
      gap < 1.0  ? `${formatNum(gap, 1)}pp above NAIRU — slack emerging` :
                   `${formatNum(gap, 1)}pp above NAIRU — meaningful slack, demand weak`;
    const payStr  = payemsVal != null
      ? ` NFP adding ~${Math.round(payemsVal)}K jobs; break-even to hold UNRATE stable ~100K.`
      : "";
    bullets.push(
      `LABOR: Unemployment at ${formatNum(unrateVal, 1)}% — ${slack}.${payStr} ` +
      `Sahm Rule threshold: 0.5pp rise from 12-month low signals recession onset. ` +
      `${unrateVal > 5.5 ? "Rising unemployment historically compresses consumer spending 6–12 months forward." : "Tight conditions sustain consumer resilience; wage inflation risk remains a secondary concern."}`
    );
  } else {
    bullets.push("LABOR: Unemployment data unavailable from FRED at this time.");
  }

  // RATES
  if (fedVal != null) {
    const realRate = cpiVal != null ? fedVal - cpiVal : null;
    const rateStance =
      fedVal >= 5.0  ? "deeply restrictive" :
      fedVal >= 3.5  ? "restrictive" :
      fedVal >= 2.5  ? "mildly restrictive / neutral" :
      fedVal >= 1.5  ? "accommodative" :
                       "emergency-level accommodation";
    const curveNote =
      t10y2yVal != null
        ? t10y2yVal < -0.5
          ? `Deep inversion (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — the most reliable recession leading indicator with avg 12-18 month lead.`
          : t10y2yVal < 0
          ? `Shallow inversion (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — recessionary signal, though timing uncertain.`
          : t10y2yVal < 0.5
          ? `Curve flattening (10Y-2Y: +${formatNum(t10y2yVal, 2)}%) — normalization, not yet expansion-confirmatory.`
          : `Curve steepened (10Y-2Y: +${formatNum(t10y2yVal, 2)}%) — expansion-phase structure; credit conditions supportive.`
        : "";
    bullets.push(
      `RATES: Fed Funds at ${formatNum(fedVal, 2)}% — ${rateStance}. ` +
      `10Y Treasury at ${t10Val != null ? `${formatNum(t10Val, 3)}%` : "—"}` +
      `${realRate != null ? `; real rate ${realRate > 0 ? "+" : ""}${formatNum(realRate, 2)}% (nominal minus CPI).` : ". "} ` +
      `${curveNote}` +
      `${recVal != null ? ` FRED recession probability model: ${formatNum(recVal, 1)}% — ${recVal > 30 ? "elevated; historically signals recession within 12 months" : recVal > 10 ? "moderate risk" : "below alarm threshold"}.` : ""}`
    );
  } else {
    bullets.push("RATES: Fed Funds rate data unavailable from FRED at this time.");
  }

  return bullets;
}

// ── Sub-components ────────────────────────────────────────────────────────────
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
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 80 }}>
      <div
        style={{
          fontSize: 8,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--color-term-dim)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-term-text)",
          letterSpacing: "0.02em",
        }}
      >
        {value != null ? `${prefix}${formatNum(value, decimals)}` : "—"}
      </div>
      <div className={glowClass} style={{ fontSize: 9, color, fontWeight: 500 }}>
        {chg != null ? formatPct(chg) : "—"}
      </div>
    </div>
  );
}

function SpreadPill({ value }) {
  if (value == null) return <span style={{ color: "var(--color-term-dim)" }}>—</span>;
  const pos = value >= 0;
  return (
    <span
      className={pos ? "glow-green" : "glow-red"}
      style={{ color: pos ? "var(--color-term-green)" : "var(--color-term-red)", fontWeight: 600 }}
    >
      {pos ? "+" : ""}{formatNum(value, 2)}%
    </span>
  );
}

function EventRow({ name, dateStr, daysOut, desc }) {
  const urgent = daysOut <= 7;
  const soon   = daysOut <= 14;
  const dotColor = urgent
    ? "var(--color-term-amber)"
    : soon
    ? "var(--color-term-cyan)"
    : "var(--color-term-dim)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        paddingBottom: 7,
        borderBottom: "1px solid var(--color-term-border)",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          marginTop: 4,
          boxShadow: urgent ? `0 0 6px ${dotColor}` : "none",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-term-text)" }}>
            {name}
          </span>
          <span
            style={{
              fontSize: 9,
              color: urgent ? "var(--color-term-amber)" : soon ? "var(--color-term-cyan)" : "var(--color-term-dim)",
              fontWeight: urgent ? 700 : 400,
              whiteSpace: "nowrap",
              marginLeft: 8,
            }}
          >
            {dateStr} · T{daysOut <= 0 ? "+0" : `-${daysOut}`}d
          </span>
        </div>
        <div style={{ fontSize: 9, color: "var(--color-term-dim)", marginTop: 2, lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
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

  // ── Market snapshot ──────────────────────────────────────────────────────
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

  // ── S&P chart ────────────────────────────────────────────────────────────
  const spChartData = data.SP500
    ? [...data.SP500].slice(0, 30).reverse().map((d) => ({
        date: d.date.slice(5),
        value: d.value,
      }))
    : [];

  // ── Yield curve values ───────────────────────────────────────────────────
  const t10y2yVal = val(data, "T10Y2Y");
  const t10y3mVal = val(data, "T10Y3M");
  const dgs10Val  = val(data, "DGS10");
  const dgs2Val   = val(data, "DGS2");

  // ── IndicatorCard values ─────────────────────────────────────────────────
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

  const pceVal       = val(data, "COREPCE");
  const recessionProb = val(data, "RECESSION");
  const payemsVal    = val(data, "PAYEMS");

  // ── Regime ───────────────────────────────────────────────────────────────
  const regime = getMacroRegime(cpiVal, gdpVal, vixVal);

  // ── Bullets ──────────────────────────────────────────────────────────────
  const bullets = buildBullets(data);

  // ── Risks / Opportunities ────────────────────────────────────────────────
  const risks = [];
  const opportunities = [];

  if (t10y2yVal != null && t10y2yVal < -0.5)
    risks.push(`Deep yield curve inversion (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — avg 12-18 month recession lead`);
  else if (t10y2yVal != null && t10y2yVal < 0)
    risks.push(`Yield curve inverted (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — historical recession signal`);
  if (t10y3mVal != null && t10y3mVal < 0)
    risks.push(`10Y-3M spread inverted (${formatNum(t10y3mVal, 2)}%) — Fed's preferred recession indicator negative`);
  if (cpiVal != null && cpiVal > 3.0)
    risks.push(`Elevated CPI at ${formatNum(cpiVal, 2)}% — Fed policy flexibility constrained; no easing runway`);
  if (vixVal != null && vixVal > 25)
    risks.push(`VIX at ${formatNum(vixVal, 1)} — elevated fear; volatility regimes compress multiples`);
  if (mortgageVal != null && mortgageVal > 7.0)
    risks.push(`30Y mortgage at ${formatNum(mortgageVal, 2)}% — housing affordability at multi-decade lows`);
  if (gdpVal != null && gdpVal < 0)
    risks.push(`GDP contracted (${formatNum(gdpVal, 1)}%) — approaching technical recession definition`);
  if (recessionProb != null && recessionProb > 20)
    risks.push(`FRED recession probability model at ${formatNum(recessionProb, 1)}% — above 20% alert threshold`);
  if (fedVal != null && cpiVal != null && fedVal - cpiVal < -1)
    risks.push(`Negative real rates (${formatNum(fedVal - cpiVal, 2)}%) — still accommodative; inflation re-ignition risk`);
  if (risks.length === 0)
    risks.push("No acute systemic risk signals flagged by current FRED data");

  if (gdpVal != null && gdpVal >= 2.5)
    opportunities.push(`Above-trend GDP (${formatNum(gdpVal, 1)}%) — supports cyclical equity overweight and credit spread compression`);
  if (unrateVal != null && unrateVal <= 4.0)
    opportunities.push(`Sub-4% unemployment — consumer balance sheets intact; spending resilience supports corporate revenues`);
  if (cpiVal != null && cpiVal <= 2.5)
    opportunities.push(`Inflation near target (${formatNum(cpiVal, 2)}%) — Fed has easing optionality; duration attractive`);
  if (t10y2yVal != null && t10y2yVal > 0.5)
    opportunities.push(`Steep yield curve (+${formatNum(t10y2yVal, 2)}%) — bank net interest margins expanding; financials constructive`);
  if (vixVal != null && vixVal < 18)
    opportunities.push(`Low volatility regime (VIX ${formatNum(vixVal, 1)}) — optimal conditions for risk-on positioning`);
  if (dgs10Val != null && fedVal != null && dgs10Val > fedVal)
    opportunities.push(`10Y at ${formatNum(dgs10Val, 3)}% vs cash ${formatNum(fedVal, 2)}% — positive term premium; bonds competitive vs equities`);
  if (pceVal != null && pceVal < 2.5 && fedVal != null && fedVal > 4)
    opportunities.push(`Core PCE (${formatNum(pceVal, 2)}%) near target with high nominal rates — real easing cycle likely; front-end duration attractive`);
  if (opportunities.length === 0)
    opportunities.push("No standout opportunity signals from current FRED data configuration");

  // ── Events Calendar ──────────────────────────────────────────────────────
  const events = getUpcomingEvents();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px" }}>

      {/* ── MARKET SNAPSHOT BAR ── */}
      <div
        className="panel"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 22px",
          alignItems: "flex-start",
          padding: "10px 14px",
        }}
      >
        <div
          style={{
            fontSize: 8,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--color-term-cyan)",
            alignSelf: "center",
            minWidth: 80,
            fontWeight: 700,
          }}
        >
          MARKET<br />SNAPSHOT
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--color-term-border)" }} />
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
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: regime.color,
                    letterSpacing: "0.08em",
                    textShadow: `0 0 12px ${regime.color}80`,
                  }}
                >
                  MACRO REGIME: {regime.label}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--color-term-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    marginTop: 2,
                  }}
                >
                  The Druckenmiller View
                </div>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--color-term-dim)",
                  textAlign: "right",
                  lineHeight: 1.5,
                }}
              >
                {TODAY}
              </div>
            </div>
            <div style={{ height: 1, background: "var(--color-term-border)", marginTop: 4 }} />
          </div>

          {/* Bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {bullets.map((bullet, i) => {
              const colonIdx = bullet.indexOf(":");
              const label  = colonIdx !== -1 ? bullet.slice(0, colonIdx) : "";
              const body   = colonIdx !== -1 ? bullet.slice(colonIdx + 1).trim() : bullet;
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-term-cyan)", flexShrink: 0, marginTop: 1 }}>▸</span>
                  <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.65 }}>
                    {label && (
                      <span
                        style={{
                          color: "var(--color-term-cyan)",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          marginRight: 4,
                        }}
                      >
                        {label}:
                      </span>
                    )}
                    {body}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* S&P 500 Chart */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="section-label" style={{ marginBottom: 0 }}>
              S&P 500 — LAST 30 SESSIONS
            </div>
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
            <ResponsiveContainer width="100%" height={170}>
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
                  content={
                    <ChartTooltip
                      formatter={(v) =>
                        v.toLocaleString("en-US", { maximumFractionDigits: 2 })
                      }
                    />
                  }
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

      {/* ── SECOND ROW: Yield Curve + Risks + Opportunities ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

        {/* Yield Curve */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="section-label">YIELD CURVE SNAPSHOT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Yields row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: 8,
                borderBottom: "1px solid var(--color-term-border)",
              }}
            >
              {[
                { label: "2Y", value: dgs2Val },
                { label: "10Y", value: dgs10Val },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--color-term-dim)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-term-text)" }}>
                    {value != null ? `${formatNum(value, 3)}%` : "—"}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  FED FUNDS
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-term-text)" }}>
                  {fedVal != null ? `${formatNum(fedVal, 2)}%` : "—"}
                </div>
              </div>
            </div>

            {/* Spreads */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--color-term-dim)" }}>10Y − 2Y SPREAD</span>
                <SpreadPill value={t10y2yVal} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--color-term-dim)" }}>10Y − 3M SPREAD</span>
                <SpreadPill value={t10y3mVal} />
              </div>
            </div>

            {/* Curve status */}
            <div
              style={{
                paddingTop: 8,
                borderTop: "1px solid var(--color-term-border)",
                fontSize: 10,
                lineHeight: 1.6,
              }}
            >
              {t10y2yVal != null ? (
                t10y2yVal < -0.5 ? (
                  <span style={{ color: "var(--color-term-red)" }}>
                    DEEPLY INVERTED — highest-confidence recession signal. Historical avg lead: 12-18 months. Prioritize capital preservation.
                  </span>
                ) : t10y2yVal < 0 ? (
                  <span style={{ color: "var(--color-term-red)" }}>
                    INVERTED — established recession leading indicator. Timing uncertain but risk-off bias warranted.
                  </span>
                ) : t10y2yVal < 0.5 ? (
                  <span style={{ color: "var(--color-term-amber)" }}>
                    FLAT / NORMALIZING — post-inversion steepening often precedes late-cycle peak. Watch closely.
                  </span>
                ) : (
                  <span style={{ color: "var(--color-term-green)" }}>
                    NORMAL — positive slope supports bank credit creation and risk-asset expansion.
                  </span>
                )
              ) : (
                <span style={{ color: "var(--color-term-dim)" }}>Spread data unavailable.</span>
              )}
            </div>
          </div>
        </div>

        {/* Key Risks */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="section-label"
            style={{ color: "var(--color-term-red)", marginBottom: 2 }}
          >
            KEY RISKS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {risks.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span
                  style={{
                    color: "var(--color-term-red)",
                    flexShrink: 0,
                    fontSize: 9,
                    marginTop: 2,
                  }}
                >
                  ◆
                </span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>
                  {r}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Opportunities */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="section-label"
            style={{ color: "var(--color-term-green)", marginBottom: 2 }}
          >
            OPPORTUNITIES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {opportunities.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span
                  style={{
                    color: "var(--color-term-green)",
                    flexShrink: 0,
                    fontSize: 9,
                    marginTop: 2,
                  }}
                >
                  ◆
                </span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>
                  {o}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: Upcoming Events + Indicator Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "start" }}>

        {/* Upcoming Events */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="section-label" style={{ marginBottom: 0 }}>UPCOMING EVENTS</div>
            <div style={{ fontSize: 8, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              APPROX. DATES
            </div>
          </div>
          <div style={{ height: 1, background: "var(--color-term-border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {events.map((e, i) => (
              <EventRow
                key={i}
                name={e.name}
                dateStr={e.dateStr}
                daysOut={e.daysOut}
                desc={e.desc}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: 8,
              color: "var(--color-term-dim)",
              lineHeight: 1.5,
              paddingTop: 4,
              borderTop: "1px solid var(--color-term-border)",
            }}
          >
            Dates are algorithmically approximated based on historical release patterns.
            Verify with the BLS, BEA, and Federal Reserve calendars.
          </div>
        </div>

        {/* Indicator Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <IndicatorCard
            label="Fed Funds"
            value={fedVal}
            unit="%"
            change={fedChg}
            decimals={2}
            detail={
              fedVal != null
                ? `Effective Fed Funds rate. Policy stance: ${
                    fedVal >= 5.5 ? "severely restrictive" :
                    fedVal >= 5.0 ? "restrictive" :
                    fedVal >= 3.0 ? "neutral-to-tight" : "accommodative"
                  }. Real rate vs CPI: ${cpiVal != null ? `${formatNum(fedVal - cpiVal, 2)}%` : "—"}. Prior: ${formatNum(fedPriorVal, 2)}%. Post-GFC avg: 0.5%; 2006 peak: 5.25%.`
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
                ? `All-items CPI, year-over-year. Fed 2% target gap: ${cpiVal > 2 ? "+" : ""}${formatNum(cpiVal - 2.0, 2)}pp. Core PCE (Fed's preferred): ${pceVal != null ? `${formatNum(pceVal, 2)}%` : "—"}. Prior: ${formatNum(cpiPriorVal, 2)}%. 2022 cycle peak: 9.1%; 1980s avg >6%.`
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
                ? `Real GDP, QoQ annualized. Prior quarter: ${formatNum(gdpPriorVal, 1)}%. Long-run potential ~2.0%. Two consecutive negative quarters = technical recession. ${
                    gdpVal < 0 ? "Contraction — monitor next print carefully." :
                    gdpVal < 1.5 ? "Sub-trend; stall-speed risk." :
                    gdpVal >= 3 ? "Above trend; overheating risk possible." : "Near-trend expansion."
                  }`
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
                ? `Civilian unemployment. CBO NAIRU: ~4.2%. Current gap: ${formatNum(unrateVal - 4.2, 1)}pp. ${
                    unrateVal <= 3.8 ? "Historically tight — wage inflation embedded." :
                    unrateVal <= 4.5 ? "Near natural rate — balanced conditions." :
                    "Above NAIRU — Sahm Rule watch active."
                  } Prior: ${formatNum(unratePrior, 1)}%. GFC peak: 10%; COVID peak: 14.7%.`
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
                ? `CBOE 30-day implied volatility. Regimes: <15 complacent, 15–25 normal, 25–35 elevated, >35 crisis. Current: ${
                    vixVal < 15 ? "COMPLACENT — tail risk underpriced" :
                    vixVal < 25 ? "NORMAL — risk-on environment" :
                    vixVal < 35 ? "ELEVATED — volatility premium expanded" : "CRISIS — forced selling / deleveraging"
                  }. COVID peak: 82.7; GFC peak: 80.9.`
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
                ? `30-year fixed rate. Spread to 10Y Treasury: ${dgs10Val != null ? `${formatNum(mortgageVal - dgs10Val, 2)}pp` : "—"}. Prior: ${formatNum(mortgagePrior, 2)}%. ${
                    mortgageVal > 7.5 ? "Multi-decade affordability lows — housing demand severely impaired." :
                    mortgageVal > 6.5 ? "Affordability stressed; buyers sidelined." :
                    mortgageVal > 5.0 ? "Rates normalized; qualified buyers constrained but active." :
                    "Historically accommodative — housing demand supported."
                  } 2021 low: ~2.7%.`
                : "Mortgage rate data unavailable."
            }
            source="FRED / MORTGAGE30US"
            sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
          />
        </div>
      </div>

    </div>
  );
}
