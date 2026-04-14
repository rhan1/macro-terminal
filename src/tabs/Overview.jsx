import { useFredData } from "../hooks/useFredData";
import { useMarketData } from "../hooks/useMarketData";
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

// ── Series to fetch ───────────────────────────────────────────────────────────
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
  // Yield curve maturities
  DGS1MO:     SERIES.DGS1MO,
  DGS3MO:     SERIES.DGS3MO,
  DGS6MO:     SERIES.DGS6MO,
  DGS1:       SERIES.DGS1,
  DGS5:       SERIES.DGS5,
  DGS7:       SERIES.DGS7,
  DGS20:      SERIES.DGS20,
  DGS30:      SERIES.DGS30,
};

// ── Date helper ───────────────────────────────────────────────────────────────
const TODAY = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function val(data, key) {
  const l = latest(data[key]);
  return l ? l.value : null;
}

// ── Macro Regime ──────────────────────────────────────────────────────────────
function getMacroRegime(cpi, gdp, vix) {
  if (vix != null && vix > 30) return "CRISIS MODE";
  if (gdp != null && gdp < 0) return "RECESSION";
  if (cpi != null && gdp != null && cpi > 3 && gdp < 1.5) return "STAGFLATION RISK";
  if (cpi != null && gdp != null && cpi < 2.5 && gdp > 2) return "GOLDILOCKS";
  return "LATE CYCLE EXPANSION";
}

// ── Analytical Bullets ────────────────────────────────────────────────────────
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
    const inf = cpiVal ?? pceVal;
    const lbl = cpiVal != null ? "CPI YoY" : "Core PCE";
    const gap = inf - 2.0;
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
    const nairu = 4.2;
    const gap = unrateVal - nairu;
    const slack =
      gap < -0.5 ? `${formatNum(Math.abs(gap), 1)}pp below NAIRU — wage pressure embedded` :
      gap < 0.3  ? "near NAIRU — labor market in balance" :
      gap < 1.0  ? `${formatNum(gap, 1)}pp above NAIRU — slack emerging` :
                   `${formatNum(gap, 1)}pp above NAIRU — meaningful slack, demand weak`;
    const payStr = payemsVal != null
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

// ── Upcoming Events ───────────────────────────────────────────────────────────
function getUpcomingEvents() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  function nextOccurrence(dayOfMonth) {
    let d = new Date(y, m, dayOfMonth);
    if (d <= now) d = new Date(y, m + 1, dayOfMonth);
    return d;
  }

  function firstFriday(yr, mo) {
    const d = new Date(yr, mo, 1);
    const dow = d.getDay();
    const daysUntilFri = (5 - dow + 7) % 7;
    d.setDate(1 + daysUntilFri);
    return d;
  }

  function nextFirstFriday() {
    let d = firstFriday(y, m);
    if (d <= now) d = firstFriday(y, m + 1);
    return d;
  }

  function nextFOMC() {
    const base = new Date(2025, 0, 29);
    let d = new Date(base);
    while (d <= now) d.setDate(d.getDate() + 42);
    return d;
  }

  function nextGDP() {
    const quarterEnds = [2, 5, 8, 11];
    for (const mo of quarterEnds) {
      const releaseMonth = (mo + 1) % 12;
      const releaseYear = mo === 11 ? y + 1 : y;
      const d = new Date(releaseYear, releaseMonth, 28);
      if (d > now) return d;
    }
    return new Date(y + 1, 1, 28);
  }

  function nextPCE() {
    let d = new Date(y, m, 28);
    if (d <= now) d = new Date(y, m + 1, 28);
    return d;
  }

  const fmt = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const events = [
    { name: "CPI Report",       date: nextOccurrence(12), desc: "Consumer Price Index, all items YoY" },
    { name: "PPI Release",      date: nextOccurrence(13), desc: "Producer Price Index, final demand" },
    { name: "FOMC Decision",    date: nextFOMC(),          desc: "Federal Open Market Committee rate decision" },
    { name: "Jobs Report",      date: nextFirstFriday(),   desc: "Nonfarm Payrolls + Unemployment Rate" },
    { name: "GDP Advance Est.", date: nextGDP(),            desc: "Real GDP QoQ annualized, advance release" },
    { name: "PCE Deflator",     date: nextPCE(),            desc: "Personal Consumption Expenditures price index" },
  ].sort((a, b) => a.date - b.date);

  return events.map((e) => ({
    ...e,
    dateStr: fmt(e.date),
    daysOut: Math.ceil((e.date - now) / 86400000),
  }));
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Overview() {
  const { data, loading, error } = useFredData(FETCH_SERIES);
  const { data: marketData, loading: marketLoading } = useMarketData();

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // ── Market snapshot values ────────────────────────────────────────────────
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

  // ── Indicator card values ─────────────────────────────────────────────────
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

  const pceVal        = val(data, "COREPCE");
  const recessionProb = val(data, "RECESSION");
  const payemsVal     = val(data, "PAYEMS");
  const t10y2yVal     = val(data, "T10Y2Y");
  const t10y3mVal     = val(data, "T10Y3M");
  const dgs10Val      = val(data, "DGS10");

  // ── Regime ────────────────────────────────────────────────────────────────
  const regimeLabel = getMacroRegime(cpiVal, gdpVal, vixVal);

  // ── Bullets ───────────────────────────────────────────────────────────────
  const bullets = buildBullets(data);

  // ── S&P 500 chart data ────────────────────────────────────────────────────
  const spChartData = data.SP500
    ? [...data.SP500].slice(0, 30).reverse().map((d) => ({
        date: d.date.slice(5),
        value: d.value,
      }))
    : [];

  // ── Yield curve chart data ────────────────────────────────────────────────
  const yieldCurvePoints = [
    { maturity: "1M",  key: "DGS1MO" },
    { maturity: "3M",  key: "DGS3MO" },
    { maturity: "6M",  key: "DGS6MO" },
    { maturity: "1Y",  key: "DGS1" },
    { maturity: "2Y",  key: "DGS2" },
    { maturity: "5Y",  key: "DGS5" },
    { maturity: "7Y",  key: "DGS7" },
    { maturity: "10Y", key: "DGS10" },
    { maturity: "20Y", key: "DGS20" },
    { maturity: "30Y", key: "DGS30" },
  ]
    .map(({ maturity, key }) => ({ maturity, value: val(data, key) }))
    .filter((p) => p.value != null);

  // ── Risks / Opportunities (always produce at least 4 each) ────────────────
  const risks = [];
  const opportunities = [];

  // Data-driven risks (add if conditions met)
  if (t10y2yVal != null && t10y2yVal < 0)
    risks.push(`Yield curve inversion (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — every recession since 1970s preceded by inversion`);
  if (t10y3mVal != null && t10y3mVal < 0)
    risks.push(`10Y-3M spread inverted (${formatNum(t10y3mVal, 2)}%) — NY Fed recession model's primary input`);
  if (cpiVal != null && cpiVal > 3.0)
    risks.push(`Elevated CPI at ${formatNum(cpiVal, 2)}% — Fed easing constrained; risk of policy error`);
  if (vixVal != null && vixVal > 25)
    risks.push(`VIX at ${formatNum(vixVal, 1)} — elevated fear regime; volatility compresses equity multiples`);
  if (mortgageVal != null && mortgageVal > 6.0)
    risks.push(`Mortgage rates at ${formatNum(mortgageVal, 2)}% — housing affordability stressed; lock-in effect constraining mobility`);
  if (gdpVal != null && gdpVal < 1.5)
    risks.push(`GDP at ${formatNum(gdpVal, 1)}% — below-trend growth; stall speed risk`);
  if (recessionProb != null && recessionProb > 15)
    risks.push(`FRED recession probability at ${formatNum(recessionProb, 1)}% — above baseline`);
  if (unrateVal != null && unrateVal > 4.2)
    risks.push(`Unemployment rising to ${formatNum(unrateVal, 1)}% — labor slack emerging; consumer spending at risk`);

  // Always-relevant structural risks (fill to 4 minimum)
  const structuralRisks = [
    "Fiscal deficits -> term premium expansion -> higher long-term rates; CBO projects rising debt-to-GDP",
    "AI-driven 'jobless growth' -> structural displacement risk for services employment",
    "Geopolitical escalation risk -> energy supply disruption -> stagflation scenario",
    "Consumer confidence disconnect -> eventual spending retrenchment as savings buffers deplete",
    `Fed policy lag -> current ${fedVal != null ? formatNum(fedVal, 2) + "%" : ""} rate effects still transmitting; full impact 12-18 months`,
  ];
  let ri = 0;
  while (risks.length < 4 && ri < structuralRisks.length) {
    risks.push(structuralRisks[ri++]);
  }

  // Data-driven opportunities
  if (gdpVal != null && gdpVal >= 2.0)
    opportunities.push(`GDP at ${formatNum(gdpVal, 1)}% — above-trend growth supports risk assets and corporate earnings`);
  if (unrateVal != null && unrateVal <= 4.2)
    opportunities.push(`Tight labor market (${formatNum(unrateVal, 1)}%) — consumer spending resilience intact`);
  if (cpiVal != null && cpiVal <= 3.0)
    opportunities.push(`Inflation at ${formatNum(cpiVal, 2)}% — disinflation trend gives Fed eventual easing optionality`);
  if (t10y2yVal != null && t10y2yVal > 0)
    opportunities.push(`Positive yield curve (+${formatNum(t10y2yVal, 2)}%) — credit expansion environment; financials benefit`);
  if (vixVal != null && vixVal < 20)
    opportunities.push(`VIX at ${formatNum(vixVal, 1)} — low vol regime supports risk-on positioning and carry trades`);
  if (dgs10Val != null && fedVal != null && dgs10Val > fedVal)
    opportunities.push(`10Y yield (${formatNum(dgs10Val, 3)}%) above cash rate — positive term premium; bonds attractive`);

  // Always-relevant structural opportunities
  const structuralOpps = [
    "AI productivity boom potential -> non-inflationary growth if adoption broadens to services sector",
    "Shelter disinflation pipeline -> OER lags actual rents by 12-18 months; core CPI tailwind ahead",
    "Fed eventually cuts -> front-end duration trade and rate-sensitive sector re-rating",
    "Tax policy and fiscal stimulus -> potential growth acceleration in 2H from reconciliation bill",
  ];
  let oi = 0;
  while (opportunities.length < 4 && oi < structuralOpps.length) {
    opportunities.push(structuralOpps[oi++]);
  }

  // ── Events Calendar ───────────────────────────────────────────────────────
  const events = getUpcomingEvents();

  // ── Signal helpers ────────────────────────────────────────────────────────
  const cpiSignal      = cpiVal != null ? (cpiVal > 3 ? "bearish" : cpiVal < 2.5 ? "bullish" : "neutral") : "neutral";
  const gdpSignal      = gdpVal != null ? (gdpVal < 0 ? "bearish" : gdpVal > 2.5 ? "bullish" : "neutral") : "neutral";
  const unrateSignal   = unrateVal != null ? (unrateVal > 4.5 ? "bearish" : unrateVal < 4 ? "bullish" : "neutral") : "neutral";
  const vixSignal      = vixVal != null ? (vixVal > 25 ? "bearish" : vixVal < 18 ? "bullish" : "neutral") : "neutral";
  const mortgageSignal = mortgageVal != null ? (mortgageVal > 7 ? "bearish" : mortgageVal < 5 ? "bullish" : "neutral") : "neutral";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px" }}>

      {/* 1 ── REGIME SUMMARY BOX ── */}
      <div
        style={{
          border: "1px solid hsla(45,90%,55%,0.3)",
          background: "hsla(45,90%,55%,0.04)",
          padding: 16,
          borderRadius: 4,
        }}
      >
        {/* Icon + Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            className="glow-amber"
            style={{ fontSize: 18, color: "hsla(45,90%,55%,1)", lineHeight: 1 }}
          >
            ⚠
          </span>
          <span
            className="glow-amber"
            style={{
              fontSize: 14,
              fontWeight: "bold",
              color: "hsla(45,90%,55%,1)",
              letterSpacing: "0.08em",
            }}
          >
            MACRO REGIME: {regimeLabel}
          </span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 10,
            color: "var(--color-term-dim)",
            letterSpacing: "0.08em",
            marginBottom: 12,
          }}
        >
          {TODAY} — The Druckenmiller View
        </div>

        {/* Analytical bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bullets.map((bullet, i) => {
            const colonIdx = bullet.indexOf(":");
            const label = colonIdx !== -1 ? bullet.slice(0, colonIdx) : "";
            const body  = colonIdx !== -1 ? bullet.slice(colonIdx + 1).trim() : bullet;
            return (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "var(--color-term-dim)",
                  lineHeight: 1.65,
                  display: "flex",
                  gap: 7,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--color-term-green)", flexShrink: 0, marginTop: 1 }}>▸</span>
                <span>
                  {label && (
                    <strong style={{ color: "var(--color-term-green)", marginRight: 4, letterSpacing: "0.04em" }}>
                      {label}:
                    </strong>
                  )}
                  {body}
                </span>
              </p>
            );
          })}
        </div>
      </div>

      {/* 2 ── MARKET SNAPSHOT BAR ── */}
      <div
        className="panel"
        style={{ padding: "10px 14px" }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--color-term-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 10,
          }}
        >
          Market Snapshot — {TODAY}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 8,
          }}
        >
          {!marketLoading && marketData
            ? [
                { key: "SPY",  displayName: "S&P 500",        prefix: "$" },
                { key: "QQQ",  displayName: "Nasdaq 100",     prefix: "$" },
                { key: "TLT",  displayName: "20+ Yr Treasury", prefix: "$" },
                { key: "GLD",  displayName: "Gold",           prefix: "$" },
                { key: "USO",  displayName: "Crude Oil",      prefix: "$" },
                { key: "HYG",  displayName: "High Yield Corp", prefix: "$" },
                { key: "VIX",  displayName: "Volatility",     prefix: "" },
              ].map(({ key, displayName, prefix }) => {
                const ticker = marketData[key];
                const price = ticker?.price ?? null;
                const changePct = ticker?.changePct ?? null;
                const fiftyTwoWeekHigh = ticker?.fiftyTwoWeekHigh ?? null;
                const fromHigh =
                  price != null && fiftyTwoWeekHigh != null
                    ? ((price - fiftyTwoWeekHigh) / fiftyTwoWeekHigh * 100).toFixed(1)
                    : null;
                const chgColor =
                  changePct == null ? "var(--color-term-dim)" :
                  changePct > 0 ? "var(--color-term-green)" :
                  changePct < 0 ? "var(--color-term-red)" :
                  "var(--color-term-dim)";
                const priceColor =
                  changePct == null ? "var(--color-term-green)" :
                  changePct > 0 ? "var(--color-term-green)" :
                  changePct < 0 ? "var(--color-term-red)" :
                  "var(--color-term-green)";
                const chgStr =
                  changePct == null ? "—" :
                  changePct >= 0
                    ? `+${changePct.toFixed(2)}%`
                    : `${changePct.toFixed(2)}%`;
                return (
                  <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 10, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {key}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: priceColor,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {price != null ? `${prefix}${price.toFixed(2)}` : "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: chgColor,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {chgStr}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--color-term-dim)" }}>
                      {fromHigh != null ? `${fromHigh}% from 52WH` : "—"}
                    </div>
                  </div>
                );
              })
            : [
                { symbol: "SP500",   value: sp500Latest?.value,  chg: sp500Chg,  decimals: 2 },
                { symbol: "NASDAQ",  value: nasdaqLatest?.value, chg: nasdaqChg, decimals: 2 },
                { symbol: "DGS10",   value: dgs10Latest?.value,  chg: dgs10Chg,  decimals: 3 },
                { symbol: "DGS2",    value: dgs2Latest?.value,   chg: dgs2Chg,   decimals: 3 },
                { symbol: "VIXCLS",  value: vixLatest?.value,    chg: vixChg,    decimals: 2 },
                { symbol: "OIL",     value: oilLatest?.value,    chg: oilChg,    decimals: 2, prefix: "$" },
                { symbol: "GOLD",    value: goldLatest?.value,   chg: goldChg,   decimals: 2, prefix: "$" },
              ].map(({ symbol, value, chg, decimals, prefix = "" }) => {
                const chgColor =
                  chg == null ? "var(--color-term-dim)" :
                  chg > 0 ? "var(--color-term-green)" :
                  chg < 0 ? "var(--color-term-red)" :
                  "var(--color-term-dim)";
                return (
                  <div key={symbol} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 10, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {symbol}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--color-term-green)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {value != null ? `${prefix}${formatNum(value, decimals)}` : "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: chgColor,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {chg != null ? formatPct(chg) : "—"}
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* 3 ── TWO CHARTS SIDE-BY-SIDE ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left: S&P 500 Area Chart */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--color-term-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              S&P 500
            </div>
            {sp500Latest && (
              <div style={{ fontSize: 10, color: "var(--color-term-text)" }}>
                {formatNum(sp500Latest.value, 2)}
                {sp500Chg != null && (
                  <span
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
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={spChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-term-border)" strokeDasharray="2 4" vertical={false} />
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
                    formatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 })}
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

        {/* Right: Yield Curve Area Chart */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-term-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Yield Curve
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={yieldCurvePoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ycGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-term-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="maturity"
                tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
              />
              <YAxis
                tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `${Number(v).toFixed(3)}%`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Yield"
                stroke="var(--color-term-green)"
                strokeWidth={2}
                fill="url(#ycGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-green)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4 ── THREE-COLUMN PANELS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Key Risks */}
        <div
          style={{
            border: "1px solid hsla(0,72%,55%,0.3)",
            background: "hsla(0,72%,55%,0.04)",
            padding: 14,
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "hsla(0,72%,55%,1)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            KEY RISKS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {risks.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: "hsla(0,72%,55%,1)", flexShrink: 0, fontSize: 9, marginTop: 2 }}>◆</span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Key Opportunities */}
        <div
          style={{
            border: "1px solid hsla(142,72%,45%,0.3)",
            background: "hsla(142,72%,45%,0.04)",
            padding: 14,
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-term-green)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            KEY OPPORTUNITIES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {opportunities.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-term-green)", flexShrink: 0, fontSize: 9, marginTop: 2 }}>◆</span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>{o}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="panel" style={{ padding: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-term-text)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            UPCOMING EVENTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {events.map((e, i) => {
              const urgent = e.daysOut <= 7;
              const soon   = e.daysOut <= 14;
              const dotColor = urgent
                ? "var(--color-term-red)"
                : soon
                ? "var(--color-term-amber)"
                : "var(--color-term-dim)";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    paddingBottom: 7,
                    paddingTop: i > 0 ? 7 : 0,
                    borderBottom: i < events.length - 1 ? "1px solid var(--color-term-border)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: dotColor,
                      flexShrink: 0,
                      marginTop: 3,
                      boxShadow: urgent ? `0 0 6px ${dotColor}` : "none",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-term-text)" }}>
                        {e.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: urgent ? "var(--color-term-red)" : soon ? "var(--color-term-amber)" : "var(--color-term-dim)",
                          fontWeight: urgent ? 700 : 400,
                          whiteSpace: "nowrap",
                          marginLeft: 6,
                        }}
                      >
                        {e.dateStr}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: "var(--color-term-dim)", marginTop: 1, lineHeight: 1.4 }}>
                      {e.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5 ── 6 INDICATOR CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <IndicatorCard
          label="Fed Funds"
          value={fedVal}
          unit="%"
          change={fedChg}
          decimals={2}
          signal="neutral"
          detail={
            fedVal != null
              ? `Effective Fed Funds rate. Policy stance: ${
                  fedVal >= 5.5 ? "severely restrictive" :
                  fedVal >= 5.0 ? "restrictive" :
                  fedVal >= 3.0 ? "neutral-to-tight" : "accommodative"
                }. Real rate vs CPI: ${cpiVal != null ? `${formatNum(fedVal - cpiVal, 2)}%` : "—"}. Prior: ${formatNum(fedPriorVal, 2)}%.`
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
          signal={cpiSignal}
          detail={
            cpiVal != null
              ? `All-items CPI, year-over-year. Fed 2% target gap: ${cpiVal > 2 ? "+" : ""}${formatNum(cpiVal - 2.0, 2)}pp. Core PCE (Fed's preferred): ${pceVal != null ? `${formatNum(pceVal, 2)}%` : "—"}. Prior: ${formatNum(cpiPriorVal, 2)}%.`
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
          signal={gdpSignal}
          detail={
            gdpVal != null
              ? `Real GDP, QoQ annualized. Prior quarter: ${formatNum(gdpPriorVal, 1)}%. Long-run potential ~2.0%. ${
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
          signal={unrateSignal}
          detail={
            unrateVal != null
              ? `Civilian unemployment. CBO NAIRU: ~4.2%. Current gap: ${formatNum(unrateVal - 4.2, 1)}pp. ${
                  unrateVal <= 3.8 ? "Historically tight — wage inflation embedded." :
                  unrateVal <= 4.5 ? "Near natural rate — balanced conditions." :
                  "Above NAIRU — Sahm Rule watch active."
                } Prior: ${formatNum(unratePrior, 1)}%.`
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
          signal={vixSignal}
          detail={
            vixVal != null
              ? `CBOE 30-day implied volatility. Regimes: <15 complacent, 15–25 normal, 25–35 elevated, >35 crisis. Current: ${
                  vixVal < 15 ? "COMPLACENT — tail risk underpriced" :
                  vixVal < 25 ? "NORMAL — risk-on environment" :
                  vixVal < 35 ? "ELEVATED — volatility premium expanded" : "CRISIS — forced selling / deleveraging"
                }.`
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
          signal={mortgageSignal}
          detail={
            mortgageVal != null
              ? `30-year fixed rate. Spread to 10Y Treasury: ${dgs10Val != null ? `${formatNum(mortgageVal - dgs10Val, 2)}pp` : "—"}. Prior: ${formatNum(mortgagePrior, 2)}%. ${
                  mortgageVal > 7.5 ? "Multi-decade affordability lows — housing demand severely impaired." :
                  mortgageVal > 6.5 ? "Affordability stressed; buyers sidelined." :
                  mortgageVal > 5.0 ? "Rates normalized; qualified buyers constrained but active." :
                  "Historically accommodative — housing demand supported."
                }`
              : "Mortgage rate data unavailable."
          }
          source="FRED / MORTGAGE30US"
          sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
        />
      </div>

    </div>
  );
}
