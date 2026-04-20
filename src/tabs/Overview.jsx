import { useState, useEffect } from "react";
import { useFredData } from "../hooks/useFredData";
import { useMarketData } from "../hooks/useMarketData";
import { useOverviewNarrative } from "../hooks/useOverviewNarrative";
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
  DGS3:       SERIES.DGS3,
  DGS5:       SERIES.DGS5,
  DGS7:       SERIES.DGS7,
  DGS20:      SERIES.DGS20,
  DGS30:      SERIES.DGS30,
  DXY:        SERIES.DXY,
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

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTHS[mi]} ${y}` : `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

// ── Macro Regime ──────────────────────────────────────────────────────────────
function getMacroRegime(cpi, gdp, vix) {
  if (vix != null && vix > 30) return "CRISIS MODE";
  if (gdp != null && gdp < 0) return "RECESSION";
  if (cpi != null && gdp != null && cpi > 3 && gdp < 1.5) return "STAGFLATION RISK";
  if (cpi != null && gdp != null && cpi < 2.5 && gdp > 2) return "GOLDILOCKS";
  return "LATE CYCLE EXPANSION";
}

function regimeReason(regime, { cpiVal, gdpVal, vixVal, unrateVal, t10y2yVal }) {
  switch (regime) {
    case "CRISIS MODE":
      return vixVal != null ? `VIX ${formatNum(vixVal, 1)} (>30)` : "VIX stress trigger active";
    case "RECESSION":
      return gdpVal != null ? `GDP ${formatNum(gdpVal, 1)}% (<0)` : "GDP contraction trigger active";
    case "STAGFLATION RISK":
      return `CPI ${formatNum(cpiVal, 2)}% (>3) · GDP ${formatNum(gdpVal, 1)}% (<1.5)`;
    case "GOLDILOCKS":
      return `CPI ${formatNum(cpiVal, 2)}% (<2.5) · GDP ${formatNum(gdpVal, 1)}% (>2)`;
    case "LATE CYCLE EXPANSION":
    default: {
      const parts = [
        cpiVal != null ? `CPI ${formatNum(cpiVal, 2)}%` : null,
        gdpVal != null ? `GDP ${formatNum(gdpVal, 1)}%` : null,
        vixVal != null ? `VIX ${formatNum(vixVal, 1)}` : null,
      ].filter(Boolean);
      const extras = [];
      if (unrateVal != null) extras.push(`UNRATE ${formatNum(unrateVal, 1)}%`);
      if (t10y2yVal != null) extras.push(`10Y-2Y ${formatNum(t10y2yVal, 2)}%`);
      const baseline = parts.length > 0 ? parts.join(" · ") : extras.join(" · ");
      return baseline
        ? `${baseline} — no stress triggers active`
        : "No stress triggers active";
    }
  }
}

// semantics: "up" means value went up.
// directionality determines color:
//   bullish=true → up=green, down=red (growth, payrolls, SPY)
//   bullish=false → up=red, down=green (CPI, unemployment, VIX)
function DeltaArrow({ current, prior, bullish }) {
  if (current == null || prior == null) return null;
  const diff = current - prior;
  const GREEN = "var(--color-term-green)";
  const RED = "var(--color-term-red)";
  const DIM = "var(--color-term-dim)";
  if (Math.abs(diff) < 1e-6) return <span style={{ color: DIM, marginLeft: 3 }}>▬</span>;
  const up = diff > 0;
  const color = (up && bullish) || (!up && !bullish) ? GREEN : RED;
  return <span style={{ color, marginLeft: 3, fontSize: 10 }}>{up ? "▲" : "▼"}</span>;
}

// ── Analytical Bullets ────────────────────────────────────────────────────────
function buildBullets(data) {
  const gdpVal = val(data, "GDP");
  const gdpPrior = prior(data.GDP)?.value;
  const cpiVal = val(data, "CPI");
  const cpiPrior = prior(data.CPI)?.value;
  const pceVal = val(data, "COREPCE");
  const pcePrior = prior(data.COREPCE)?.value;
  const unrateVal = val(data, "UNRATE");
  const unratePrior = prior(data.UNRATE)?.value;
  const payemsVal = val(data, "PAYEMS");
  const payemsPrior = prior(data.PAYEMS)?.value;
  const fedVal = val(data, "FEDFUNDS");
  const t10Val = val(data, "DGS10");
  const t10y2yVal = val(data, "T10Y2Y");
  const recVal = val(data, "RECESSION");

  const bullets = [];

  if (gdpVal != null) {
    const regimeCall =
      gdpVal >= 3.0 ? "a pace that historically sustains broad cyclical exposure" :
      gdpVal >= 2.5 ? "above potential, which favors cyclical overweight but not indiscriminate risk-on" :
      gdpVal >= 2.0 ? "still above trend, though the margin for error is narrowing" :
      gdpVal >= 0.5 ? "below trend - the economy is decelerating into stall-speed territory" :
      gdpVal >= 0 ? "near-stall, where the probability of outright contraction rises sharply" :
      "contraction - technical recession criteria are being met";
    const momentumNote =
      gdpPrior != null
        ? gdpVal > gdpPrior
          ? `accelerating from a prior ${formatNum(gdpPrior, 1)}%, which strengthens the expansion case`
          : gdpVal < gdpPrior
          ? `decelerating from ${formatNum(gdpPrior, 1)}% - the direction of travel matters as much as the level`
          : `unchanged from the prior ${formatNum(gdpPrior, 1)}%, offering no incremental signal`
        : null;
    const positionNote =
      gdpVal < 1 ? "At sub-1%, the playbook shifts decisively to defensives and duration." :
      gdpVal >= 2.5 ? "This pace supports selective cyclical exposure while maintaining quality discipline." :
      "Mid-cycle velocity argues for quality over momentum and patience over conviction.";
    bullets.push(
      <>
        The U.S. economy grew at{" "}
        <strong style={{ color: "hsl(220,15%,95%)" }}>{formatNum(gdpVal, 1)}%</strong>
        <DeltaArrow current={gdpVal} prior={gdpPrior} bullish={true} /> annualized,
        {momentumNote ? ` ${momentumNote} - ` : " "}
        {regimeCall}. Growth velocity sets the risk-asset regime, and the current trajectory is the
        primary variable to watch. {positionNote}
      </>
    );
  } else {
    bullets.push("GDP data is not yet available from FRED - the growth regime cannot be assessed with confidence.");
  }

  if (cpiVal != null || pceVal != null) {
    const inf = cpiVal ?? pceVal;
    const lbl = cpiVal != null ? "CPI" : "Core PCE";
    const gap = inf - 2.0;
    const gapStr = gap > 0 ? `${formatNum(gap, 1)}pp above` : `${formatNum(Math.abs(gap), 1)}pp below`;
    const lastMileNote =
      inf > 4.0 ? "Rate cuts are off the table until the Fed sees sustained, material disinflation - the policy path is unambiguously higher for longer." :
      inf > 3.0 ? "The last mile of disinflation is proving sticky, and a premature pivot would risk a second inflation wave. The Fed cannot afford to blink." :
      inf > 2.5 ? "Disinflation is progressing, but the final leg back to 2% has historically been the hardest. The Fed retains a tightening bias." :
      inf > 1.5 ? "Inflation is functionally on target, giving the Fed meaningful optionality to ease without sacrificing credibility." :
      "Inflation has undershot the target - disinflationary forces are dominant, and the easing case is building.";
    bullets.push(
      <>
        Inflation remains the binding constraint for policy. {lbl} is running at{" "}
        <strong style={{ color: "hsl(220,15%,95%)" }}>{formatNum(inf, 2)}%</strong>
        <DeltaArrow current={cpiVal != null ? cpiVal : pceVal} prior={cpiVal != null ? cpiPrior : pcePrior} bullish={false} />,{" "}
        {gapStr} the Fed&apos;s 2% target. {lastMileNote}
        {pceVal != null && (
          <>
            {" "}Core PCE at{" "}
            <strong style={{ color: "hsl(220,15%,95%)" }}>{formatNum(pceVal, 2)}%</strong>
            <DeltaArrow current={pceVal} prior={pcePrior} bullish={false} /> - the Fed&apos;s
            preferred gauge - confirms the picture.
          </>
        )}
      </>
    );
  } else {
    bullets.push("Inflation data is not yet available from FRED - the policy constraint cannot be fully assessed.");
  }

  if (unrateVal != null) {
    const nairu = 4.2;
    const gap = unrateVal - nairu;
    const laborRead =
      gap < -0.5 ? `${formatNum(Math.abs(gap), 1)}pp below NAIRU, embedding wage pressure that keeps the Fed's hands tied` :
      gap < 0.3 ? "essentially at NAIRU - labor supply and demand are in rough balance" :
      gap < 1.0 ? `${formatNum(gap, 1)}pp above NAIRU, with slack beginning to build and wage growth softening` :
      `${formatNum(gap, 1)}pp above NAIRU - meaningful slack has opened up, and consumer demand is feeling the pressure`;
    const payNote = payemsVal != null
      ? (
          <>
            {" "}Monthly payrolls are tracking around{" "}
            <strong style={{ color: "hsl(220,15%,95%)" }}>{Math.round(payemsVal)}K</strong>
            <DeltaArrow current={payemsVal} prior={payemsPrior} bullish={true} /> - above the ~100K
            break-even needed to absorb new labor force entrants.
          </>
        )
      : "";
    const sahmNote =
      unrateVal > 5.5
        ? "History shows that unemployment at this level compresses consumer spending with a 6-12 month lag - the second-order effects are worth watching."
        : "Tight labor market conditions are the primary support for consumer resilience, but they also keep inflation from falling cleanly.";
    bullets.push(
      <>
        Unemployment stands at{" "}
        <strong style={{ color: "hsl(220,15%,95%)" }}>{formatNum(unrateVal, 1)}%</strong>
        <DeltaArrow current={unrateVal} prior={unratePrior} bullish={false} />, {laborRead}.
        {payNote} The Sahm Rule - triggered by a 0.5pp rise from the 12-month low - remains the
        cleanest real-time recession signal. {sahmNote}
      </>
    );
  } else {
    bullets.push("Unemployment data is not yet available from FRED - labor market conditions cannot be assessed.");
  }

  if (fedVal != null) {
    const realRate = cpiVal != null ? fedVal - cpiVal : null;
    const rateRead =
      fedVal >= 5.0 ? "deeply in restrictive territory - financial conditions are meaningfully tight" :
      fedVal >= 3.5 ? "in restrictive territory, actively restraining credit and investment" :
      fedVal >= 2.5 ? "at the boundary of neutral - neither stimulative nor clearly restrictive" :
      fedVal >= 1.5 ? "accommodative, providing a tailwind to risk assets and credit" :
      "at emergency-level accommodation - the Fed is in crisis-fighting mode";
    const realRateNote = realRate != null
      ? ` The real rate - Fed Funds minus CPI - sits at ${realRate > 0 ? "+" : ""}${formatNum(realRate, 2)}%, the truest measure of how tight conditions actually are.`
      : "";
    const curveNote =
      t10y2yVal != null
        ? t10y2yVal < -0.5
          ? ` The curve remains deeply inverted (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) - historically the most reliable recession signal, with a 12-18 month average lead time.`
          : t10y2yVal < 0
          ? ` A shallow inversion persists (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) - the recessionary signal is there, but timing is uncertain.`
          : t10y2yVal < 0.5
          ? ` The curve is normalizing (10Y-2Y: +${formatNum(t10y2yVal, 2)}%) - disinversion is underway, but a return to expansion-phase steepness is not confirmed.`
          : ` The curve has re-steepened (10Y-2Y: +${formatNum(t10y2yVal, 2)}%) - an expansion-phase structure that is supportive of credit conditions.`
        : "";
    const recNote = recVal != null
      ? ` FRED's recession probability model is at ${formatNum(recVal, 1)}% - ${recVal > 30 ? "an elevated reading that has historically preceded recession within 12 months" : recVal > 10 ? "a moderate risk reading that warrants monitoring" : "a subdued reading, below levels that historically demand defensive repositioning"}.`
      : "";
    bullets.push(
      `Fed Funds at ${formatNum(fedVal, 2)}% places policy ${rateRead}. ` +
      `The 10Y Treasury is ${t10Val != null ? `at ${formatNum(t10Val, 3)}%` : "unavailable"}.${realRateNote}${curveNote}${recNote}`
    );
  } else {
    bullets.push("Fed Funds rate data is not yet available from FRED - the policy stance cannot be assessed.");
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
    const dates = [
      new Date(2026, 0, 28),
      new Date(2026, 2, 18),
      new Date(2026, 4, 6),
      new Date(2026, 5, 17),
      new Date(2026, 6, 29),
      new Date(2026, 8, 16),
      new Date(2026, 10, 4),
      new Date(2026, 11, 16),
    ];
    const now = new Date();
    for (const d of dates) {
      if (d > now) return d;
    }
    return dates[dates.length - 1];
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
function getRegimeTint(regime, spyPct) {
  const RED = { border: "hsla(0,72%,55%,0.35)", bg: "hsla(0,72%,55%,0.05)", accent: "hsl(0,72%,60%)" };
  const ORANGE = { border: "hsla(20,80%,55%,0.35)", bg: "hsla(20,80%,55%,0.05)", accent: "hsl(20,85%,60%)" };
  const AMBER = { border: "hsla(45,90%,55%,0.3)", bg: "hsla(45,90%,55%,0.04)", accent: "hsl(45,90%,55%)" };
  const GREEN = { border: "hsla(142,70%,45%,0.3)", bg: "hsla(142,70%,45%,0.04)", accent: "hsl(142,70%,55%)" };

  let tint =
    regime === "CRISIS MODE" || regime === "RECESSION" ? RED :
    regime === "STAGFLATION RISK" ? ORANGE :
    regime === "LATE CYCLE EXPANSION" ? AMBER :
    regime === "GOLDILOCKS" ? GREEN :
    AMBER;

  if (spyPct != null && spyPct < -0.8) {
    if (tint === GREEN) tint = AMBER;
    else if (tint === AMBER) tint = ORANGE;
    else if (tint === ORANGE) tint = RED;
  }

  return tint;
}

export default function Overview() {
  const { data, loading, error } = useFredData(FETCH_SERIES);
  const { data: marketData, spyChart, chartRange, loadChart, loading: marketLoading, lastUpdated } = useMarketData();

  // Live refresh age display
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const ageStr = lastUpdated
    ? (() => {
        const sec = Math.floor((now - lastUpdated) / 1000);
        return sec < 5 ? "just now" : sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
      })()
    : null;

  if (loading && Object.keys(data).length === 0) return <Loading />;
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
  const dxyLatest    = latest(data.DXY);
  const dxyPrior     = prior(data.DXY);

  const sp500Chg  = change(sp500Latest?.value,  sp500Prior?.value);
  const nasdaqChg = change(nasdaqLatest?.value, nasdaqPrior?.value);
  const dgs10Chg  = change(dgs10Latest?.value,  dgs10Prior?.value);
  const dgs2Chg   = change(dgs2Latest?.value,   dgs2Prior?.value);
  const vixChg    = change(vixLatest?.value,    vixPrior?.value);
  const oilChg    = change(oilLatest?.value,    oilPrior?.value);
  const goldChg   = change(goldLatest?.value,   goldPrior?.value);
  const dxyChg    = change(dxyLatest?.value,    dxyPrior?.value);

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
  const regimeReasonText = regimeReason(regimeLabel, { cpiVal, gdpVal, vixVal, unrateVal, t10y2yVal });
  const bullets = buildBullets(data);

  // ── S&P 500 chart data (Yahoo Finance 1Y) ────────────────────────────────
  const spChartData = spyChart?.points
    ? spyChart.points.map((p) => ({
        date: p.date.slice(5),
        value: p.close,
      }))
    : [];
  const spyPrice = spyChart?.meta?.price ?? marketData?.SPY?.price;
  const spyChangePct = marketData?.SPY?.changePct ?? null;
  const regimeTint = getRegimeTint(regimeLabel, spyChangePct);
  const spy52WH = spyChart?.meta?.fiftyTwoWeekHigh ?? marketData?.SPY?.fiftyTwoWeekHigh;
  const spy52WL = spyChart?.meta?.fiftyTwoWeekLow ?? marketData?.SPY?.fiftyTwoWeekLow;

  // ── Yield curve chart data (current, 1W ago, 1M ago) ─────────────────────
  const ycMaturities = [
    { maturity: "1M",  key: "DGS1MO" },
    { maturity: "3M",  key: "DGS3MO" },
    { maturity: "6M",  key: "DGS6MO" },
    { maturity: "1Y",  key: "DGS1" },
    { maturity: "2Y",  key: "DGS2" },
    { maturity: "3Y",  key: "DGS3" },
    { maturity: "5Y",  key: "DGS5" },
    { maturity: "7Y",  key: "DGS7" },
    { maturity: "10Y", key: "DGS10" },
    { maturity: "20Y", key: "DGS20" },
    { maturity: "30Y", key: "DGS30" },
  ];
  const yieldCurveData = ycMaturities
    .map(({ maturity, key }) => {
      const arr = data[key];
      return {
        maturity,
        current: arr?.[0]?.value ?? null,
        weekAgo: arr?.[5]?.value ?? null,
        monthAgo: (arr?.[22] ?? arr?.[arr?.length - 1])?.value ?? null,
      };
    })
    .filter((p) => p.current != null);
  const yieldCurveDate = data.DGS10?.[0]?.date;
  const yieldCurveDateFmt = yieldCurveDate
    ? new Date(yieldCurveDate + "T00:00:00").toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // ── Risks / Opportunities (always produce at least 4 each) ────────────────
  const risks = [];
  const opportunities = [];

  // Data-driven risks (add if conditions met)
  if (t10y2yVal != null && t10y2yVal < 0)
    risks.push(`Yield curve inversion (10Y-2Y: ${formatNum(t10y2yVal, 2)}%) — every recession since 1970s preceded by inversion`);
  if (t10y3mVal != null && t10y3mVal < 0)
    risks.push(`10Y-3M spread inverted (${formatNum(t10y3mVal, 2)}%) — NY Fed recession model's primary input`);
  if (cpiVal != null && cpiVal > 3.0)
    risks.push(`Elevated CPI at ${formatNum(cpiVal, 2)}% — Fed easing constrained; policy remains higher for longer`);
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

  // ── Rates card signals + change labels ──────────────────────────────────
  const dgs10Prior2 = prior(data.DGS10)?.value;
  const dgs2Prior2  = prior(data.DGS2)?.value;
  const t10y2yPrior = prior(data.T10Y2Y)?.value;
  const t10y3mPrior = prior(data.T10Y3M)?.value;

  const dgs10Signal = dgs10Val != null ? (dgs10Val > 4.5 ? "bearish" : dgs10Val < 3.5 ? "bullish" : "neutral") : "neutral";
  const dgs2Signal  = dgs2Latest?.value != null ? (dgs2Latest.value > 4.5 ? "bearish" : dgs2Latest.value < 3.5 ? "bullish" : "neutral") : "neutral";
  const t10y2ySignal = t10y2yVal != null ? (t10y2yVal < 0 ? "bearish" : t10y2yVal > 0.5 ? "bullish" : "neutral") : "neutral";
  const t10y3mSignal = t10y3mVal != null ? (t10y3mVal < 0 ? "bearish" : t10y3mVal > 0.5 ? "bullish" : "neutral") : "neutral";

  function bpsLabel(current, prev) {
    if (current == null || prev == null) return "";
    const bps = Math.round((current - prev) * 100);
    return `${bps >= 0 ? "+" : ""}${bps} bps from ${formatNum(prev, 2)}%`;
  }

  function spreadDir(current, prev) {
    if (current == null || prev == null) return "flat";
    return current > prev ? "up" : current < prev ? "down" : "flat";
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px" }}>

      {/* 1 ── REGIME SUMMARY BOX ── */}
      <div
        style={{
          border: `1px solid ${regimeTint.border}`,
          background: regimeTint.bg,
          padding: 16,
          borderRadius: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="glow-amber" style={{ fontSize: 18, color: regimeTint.accent, lineHeight: 1 }}>⚠</span>
            <span className="glow-amber" style={{ fontSize: 14, fontWeight: "bold", color: regimeTint.accent, letterSpacing: "0.08em" }}>
              MACRO REGIME: {regimeLabel}
            </span>
          </div>
          <span style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 3,
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: "0.04em",
            color: "hsla(45,90%,55%,1)",
            border: "1px solid hsla(45,90%,55%,0.35)",
            background: "hsla(45,90%,55%,0.06)",
          }}>
            {TODAY}
          </span>
        </div>

        {/* Reason line: WHY this regime is classified */}
        <div
          style={{
            fontSize: 10,
            color: "var(--color-term-dim)",
            letterSpacing: "0.04em",
            marginBottom: 12,
          }}
        >
          Triggered by: {regimeReasonText}
        </div>

        <NarrativePanel spyChangePct={spyChangePct} />

        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--color-term-border)",
        }}>
          <div style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "hsl(220,10%,42%)",
            marginBottom: 8,
          }}>
            Analytical Brief · via FRED
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bullets.map((bullet, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "var(--color-term-text)",
                  lineHeight: 1.65,
                  display: "flex",
                  gap: 7,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--color-term-dim)", flexShrink: 0, marginTop: 1 }}>&gt;</span>
                <span>{bullet}</span>
              </p>
            ))}
          </div>
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
          {ageStr && (
            <span style={{ marginLeft: 8, color: "var(--color-term-green)", fontWeight: 400 }}>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "var(--color-term-green)", marginRight: 4, animation: "cursor-blink 2s step-end infinite" }} />
              {ageStr}
            </span>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: 8,
          }}
        >
          {!marketLoading && marketData
            ? [
                { key: "SPY",      displayName: "S&P 500",        prefix: "$" },
                { key: "QQQ",      displayName: "Nasdaq 100",     prefix: "$" },
                { key: "TLT",      displayName: "20+ Yr Treasury", prefix: "$" },
                { key: "GLD",      displayName: "Gold",           prefix: "$" },
                { key: "USO",      displayName: "Crude Oil",      prefix: "$" },
                { key: "HYG",      displayName: "High Yield Corp", prefix: "$" },
                { key: "VIX",      displayName: "Volatility",     prefix: "" },
                { key: "UNG",      displayName: "Nat Gas",        prefix: "$" },
                { key: "CPER",     displayName: "Copper",         prefix: "$" },
                { key: "FXE",      displayName: "EUR/USD",        prefix: "$" },
                { key: "FXY",      displayName: "JPY",            prefix: "$" },
                { key: "FXB",      displayName: "GBP/USD",        prefix: "$" },
                { key: "BTC-USD",  displayName: "Bitcoin",        prefix: "$" },
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
                  <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "center" }}>
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
                      {price != null
                        ? `${prefix}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
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
          {/* DXY from FRED (no Yahoo data) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              DXY
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: dxyChg == null ? "var(--color-term-green)" : dxyChg > 0 ? "var(--color-term-green)" : dxyChg < 0 ? "var(--color-term-red)" : "var(--color-term-green)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dxyLatest?.value != null ? formatNum(dxyLatest.value, 2) : "—"}
            </div>
            <div
              style={{
                fontSize: 10,
                color: dxyChg == null ? "var(--color-term-dim)" : dxyChg > 0 ? "var(--color-term-green)" : dxyChg < 0 ? "var(--color-term-red)" : "var(--color-term-dim)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dxyChg != null ? formatPct(dxyChg) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* 3 ── TWO CHARTS SIDE-BY-SIDE ── */}
      <div className="grid-2">

        {/* Left: S&P 500 Area Chart — 1 Year */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 10, color: "var(--color-term-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  S&P 500 (SPY)
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                  {[
                    { label: "1M", range: "1mo" },
                    { label: "3M", range: "3mo" },
                    { label: "6M", range: "6mo" },
                    { label: "1Y", range: "1y" },
                    { label: "5Y", range: "5y" },
                  ].map(({ label, range }) => (
                    <button
                      key={range}
                      onClick={() => loadChart(range)}
                      style={{
                        background: chartRange === range ? "hsla(142,70%,55%,0.15)" : "none",
                        border: chartRange === range ? "1px solid hsla(142,70%,55%,0.4)" : "1px solid transparent",
                        color: chartRange === range ? "hsl(142,70%,55%)" : "var(--color-term-dim)",
                        fontSize: 9,
                        fontFamily: "inherit",
                        padding: "2px 8px",
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                        fontWeight: chartRange === range ? 600 : 400,
                        transition: "all 0.1s",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-term-green)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {spyPrice != null ? `$${spyPrice.toFixed(2)}` : "—"}
                </span>
                {spyChangePct != null && (
                  <span
                    style={{
                      fontSize: 11,
                      color: spyChangePct >= 0 ? "var(--color-term-green)" : "var(--color-term-red)",
                    }}
                  >
                    {spyChangePct >= 0 ? "+" : ""}{spyChangePct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            {spy52WL != null && spy52WH != null && (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--color-term-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  52W Range
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-term-dim)",
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${spy52WL.toFixed(2)} — ${spy52WH.toFixed(2)}
                </div>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={spChartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-term-border)" }}
                interval={Math.max(1, Math.floor(spChartData.length / 5))}
              />
              <YAxis
                tick={{ fontSize: 8, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                name="SPY"
                stroke="var(--color-term-green)"
                strokeWidth={1.5}
                fill="url(#spGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-green)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: U.S. Treasury Yield Curve */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-term-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                U.S. Treasury Yield Curve
              </div>
              {yieldCurveDateFmt && (
                <div style={{ fontSize: 10, color: "var(--color-term-green)", marginTop: 2 }}>
                  As of {yieldCurveDateFmt}
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 10,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 12, height: 2, background: "var(--color-term-green)" }} />
                Current
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-term-dim)" }}>
                <span style={{ display: "inline-block", width: 12, height: 2, background: "var(--color-term-amber)", opacity: 0.5 }} />
                1W Ago
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-term-dim)" }}>
                <span style={{ display: "inline-block", width: 12, height: 2, background: "var(--color-term-red)", opacity: 0.3 }} />
                1M Ago
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={yieldCurveData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="ycGreenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-term-green)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-term-green)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="maturity"
                tick={{ fontSize: 10, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-term-dim)", fontFamily: "inherit" }}
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
              {fedVal != null && (
                <ReferenceLine
                  y={fedVal}
                  stroke="hsl(220, 15%, 15%)"
                  strokeDasharray="3 3"
                  label={{ value: "FF Rate", fontSize: 9, fill: "hsl(220, 10%, 35%)", position: "insideTopRight" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="monthAgo"
                name="1M Ago"
                stroke="var(--color-term-red)"
                strokeWidth={1}
                strokeOpacity={0.3}
                fill="none"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="weekAgo"
                name="1W Ago"
                stroke="var(--color-term-amber)"
                strokeWidth={1}
                strokeOpacity={0.5}
                fill="none"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="current"
                name="Current"
                stroke="var(--color-term-green)"
                strokeWidth={2}
                fill="url(#ycGreenGrad)"
                dot={{ r: 3, fill: "hsl(142, 70%, 55%)", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4 ── THREE-COLUMN PANELS ── */}
      <div className="grid-3">

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
              fontSize: 10,
              fontWeight: 600,
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
                <span style={{ color: "hsla(0,72%,55%,1)", flexShrink: 0, fontSize: 9, marginTop: 2 }}>▸</span>
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
              fontSize: 10,
              fontWeight: 600,
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
                <span style={{ color: "var(--color-term-green)", flexShrink: 0, fontSize: 9, marginTop: 2 }}>▸</span>
                <span style={{ fontSize: 10, color: "var(--color-term-text)", lineHeight: 1.6 }}>{o}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="panel" style={{ padding: 14 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "hsl(185,70%,55%)",
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

      {/* 5 ── 6 INDICATOR CARDS (rates-focused) ── */}
      <div className="grid-3">
        <IndicatorCard
          label="Fed Funds Rate"
          value={fedVal}
          unit="%"
          decimals={2}
          signal="neutral"
          direction="flat"
          changeLabel={bpsLabel(fedVal, fedPriorVal)}
          detail={
            fedVal != null
              ? `Effective Fed Funds rate. Policy stance: ${
                  fedVal >= 5.5 ? "severely restrictive" :
                  fedVal >= 5.0 ? "restrictive" :
                  fedVal >= 3.0 ? "neutral-to-tight" : "accommodative"
                }. Real rate vs CPI: ${cpiVal != null ? `${formatNum(fedVal - cpiVal, 2)}%` : "—"}.`
              : "Fed Funds data unavailable."
          }
          source="FRED / DFF"
          sourceUrl="https://fred.stlouisfed.org/series/DFF"
          dateLabel={fmtCardDate(latest(data.FEDFUNDS)?.date)}
          sparkData={data.FEDFUNDS?.slice(0, 7)}
        />
        <IndicatorCard
          label="10Y Treasury Yield"
          value={dgs10Val}
          unit="%"
          decimals={2}
          signal={dgs10Signal}
          direction={spreadDir(dgs10Val, dgs10Prior2)}
          changeLabel={bpsLabel(dgs10Val, dgs10Prior2)}
          detail={
            dgs10Val != null
              ? `10-Year Treasury yield — benchmark for mortgages, corporate bonds, and risk-free rate expectations. Real yield (vs CPI): ${cpiVal != null ? formatNum(dgs10Val - cpiVal, 2) + "%" : "—"}. Term premium signals duration risk appetite.`
              : "10Y yield data unavailable."
          }
          source="FRED / DGS10"
          sourceUrl="https://fred.stlouisfed.org/series/DGS10"
          dateLabel={fmtCardDate(latest(data.DGS10)?.date)}
          sparkData={data.DGS10?.slice(0, 7)}
        />
        <IndicatorCard
          label="2Y Treasury Yield"
          value={dgs2Latest?.value}
          unit="%"
          decimals={2}
          signal={dgs2Signal}
          direction={spreadDir(dgs2Latest?.value, dgs2Prior2)}
          changeLabel={bpsLabel(dgs2Latest?.value, dgs2Prior2)}
          detail={
            dgs2Latest?.value != null
              ? `2-Year Treasury yield — most sensitive to Fed policy expectations. Reflects market pricing of near-term rate path. Spread to Fed Funds: ${fedVal != null ? formatNum(dgs2Latest.value - fedVal, 0) + " bps" : "—"}.`
              : "2Y yield data unavailable."
          }
          source="FRED / DGS2"
          sourceUrl="https://fred.stlouisfed.org/series/DGS2"
          dateLabel={fmtCardDate(latest(data.DGS2)?.date)}
          sparkData={data.DGS2?.slice(0, 7)}
        />
        <IndicatorCard
          label="2s10s Spread"
          value={t10y2yVal}
          unit="%"
          decimals={2}
          signal={t10y2ySignal}
          direction={spreadDir(t10y2yVal, t10y2yPrior)}
          changeLabel={bpsLabel(t10y2yVal, t10y2yPrior)}
          detail={
            t10y2yVal != null
              ? `10Y minus 2Y Treasury spread. ${t10y2yVal < 0 ? "INVERTED — every recession since 1970s preceded by sustained inversion." : "Positive slope — normal term structure."} Key recession signal for the rates market.`
              : "Spread data unavailable."
          }
          source="FRED / T10Y2Y"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y"
          dateLabel={fmtCardDate(latest(data.T10Y2Y)?.date)}
          sparkData={data.T10Y2Y?.slice(0, 7)}
        />
        <IndicatorCard
          label="10Y-3M Spread"
          value={t10y3mVal}
          unit="%"
          decimals={2}
          signal={t10y3mSignal}
          direction={spreadDir(t10y3mVal, t10y3mPrior)}
          changeLabel={bpsLabel(t10y3mVal, t10y3mPrior)}
          detail={
            t10y3mVal != null
              ? `10Y minus 3M Treasury spread — NY Fed recession probability model's primary input. ${t10y3mVal < 0 ? "INVERTED — historically the most reliable recession predictor." : "Positive — recession signal not active."}`
              : "Spread data unavailable."
          }
          source="FRED / T10Y3M"
          sourceUrl="https://fred.stlouisfed.org/series/T10Y3M"
          dateLabel={fmtCardDate(latest(data.T10Y3M)?.date)}
          sparkData={data.T10Y3M?.slice(0, 7)}
        />
        <IndicatorCard
          label="30Y Mortgage Rate"
          value={mortgageVal}
          unit="%"
          decimals={2}
          signal={mortgageSignal}
          direction={spreadDir(mortgageVal, mortgagePrior)}
          changeLabel={bpsLabel(mortgageVal, mortgagePrior)}
          detail={
            mortgageVal != null
              ? `30-year fixed mortgage rate. Spread to 10Y: ${dgs10Val != null ? formatNum(mortgageVal - dgs10Val, 0) + " bps" : "—"}. ${
                  mortgageVal > 7.5 ? "Multi-decade affordability lows." :
                  mortgageVal > 6.5 ? "Affordability stressed; buyers sidelined." :
                  mortgageVal > 5.0 ? "Rates normalized." :
                  "Historically accommodative."
                }`
              : "Mortgage rate data unavailable."
          }
          source="FRED / MORTGAGE30US"
          sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
          dateLabel={fmtCardDate(latest(data.MORTGAGE30)?.date)}
          sparkData={data.MORTGAGE30?.slice(0, 7)}
        />
      </div>

    </div>
  );
}

// ── Perplexity Sonar-sourced narrative ───────────────────────────────────────
function tintFromPct(pct) {
  if (pct == null) return { accent: "hsl(185,70%,55%)", border: "hsl(220,15%,14%)" };
  if (pct > 0.3) return { accent: "hsl(142,70%,55%)", border: "hsla(142,70%,45%,0.35)" };
  if (pct < -0.3) return { accent: "hsl(0,72%,55%)", border: "hsla(0,72%,45%,0.35)" };
  return { accent: "hsl(185,70%,55%)", border: "hsl(220,15%,14%)" };
}

function hostnameFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function renderWithBoldAndCitations(text, sources) {
  const pieces = [];
  let key = 0;

  const tokens = text.split(/(\*\*[^*]+\*\*|(?:\[\d+\])+)/g);
  for (const tok of tokens) {
    if (!tok) continue;
    const boldMatch = tok.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      pieces.push(
        <strong key={`b${key++}`} style={{ color: "hsl(220,15%,95%)", fontWeight: 600 }}>
          {boldMatch[1]}
        </strong>
      );
      continue;
    }
    if (/^(\[\d+\])+$/.test(tok)) {
      const nums = [...tok.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10));
      const firstUrl = sources[nums[0] - 1]?.url;
      const label = nums.length === 1 ? `[${nums[0]}]` : `[${nums.join(",")}]`;
      if (firstUrl) {
        pieces.push(
          <a
            key={`c${key++}`}
            href={firstUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "hsl(185,70%,60%)",
              textDecoration: "none",
              fontSize: 9,
              verticalAlign: "super",
              margin: "0 2px",
              padding: "0 3px",
              borderRadius: 2,
              background: "hsla(185,70%,55%,0.1)",
            }}
          >
            {label}
          </a>
        );
      } else {
        pieces.push(<span key={`c${key++}`}>{label}</span>);
      }
      continue;
    }
    pieces.push(<span key={`t${key++}`}>{tok}</span>);
  }
  return pieces;
}

function preprocessNarrative(text) {
  if (!text) return "";

  return text
    .replace(/^\s*\*?\*?Top\s+US\s+macro\s+news\s+items\s+driving\s+markets\s+on[^\n]+\n+/i, "")
    .replace(/^\s*\*?\*?Here['']?s\s+[^\n]*:\*?\*?\s*\n+/i, "")
    .replace(/^\s*\*?\*?Top\s+[^\n]+?(driving|moving)\s+(us\s+)?markets[^\n]*:\*?\*?\s*\n+/i, "")
    .trim();
}

function NarrativePanel({ spyChangePct }) {
  const { data, loading } = useOverviewNarrative();

  if (loading) return null;
  if (!data || data.error || !data.paragraph) return null;

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const tint = tintFromPct(spyChangePct);
  const cleanedParagraph = preprocessNarrative(data.paragraph);
  const lines = cleanedParagraph.split("\n").map((line) => line.trim()).filter(Boolean);
  const bulletLineCount = lines.filter((line) => /^[-*•]\s/.test(line)).length;
  const isBulletList = bulletLineCount >= 2;
  const bulletItems = isBulletList
    ? cleanedParagraph
        .split(/\n(?=[-*•]\s)/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/^[-*•]\s+/, "").trim())
    : [];
  const paragraphs = isBulletList
    ? []
    : cleanedParagraph.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const sectionLabels = paragraphs.length === 3 ? ["MARKETS", "POLICY", "CATALYST"] : null;
  const chipStyles = {
    MARKETS: { chipColor: "hsl(185,70%,55%)", chipBg: "hsla(185,70%,55%,0.1)" },
    POLICY: { chipColor: "hsl(45,90%,55%)", chipBg: "hsla(45,90%,55%,0.1)" },
    CATALYST: { chipColor: "hsl(280,70%,60%)", chipBg: "hsla(280,70%,60%,0.1)" },
  };
  const uniqueSources = [];
  const seenHosts = new Set();
  for (const s of sources) {
    if (!s?.url) continue;
    const h = hostnameFrom(s.url);
    if (seenHosts.has(h)) continue;
    seenHosts.add(h);
    uniqueSources.push({ url: s.url, host: h });
  }

  return (
    <div
      style={{
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "hsl(220,10%,42%)",
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: `1px solid ${tint.border}`,
        }}
      >
        Headline News · via Perplexity Sonar
      </div>
      {isBulletList ? (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {bulletItems.map((bullet, i) => (
            <li
              key={i}
              style={{
                margin: i === bulletItems.length - 1 ? 0 : "0 0 8px 0",
                fontSize: 11,
                lineHeight: 1.7,
                color: "var(--color-term-text)",
                display: "flex",
                gap: 7,
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: tint.accent ?? "var(--color-term-dim)", flexShrink: 0, marginTop: 1 }}>▸</span>
              <span>{renderWithBoldAndCitations(bullet, sources)}</span>
            </li>
          ))}
        </ul>
      ) : (
        paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              margin: i === paragraphs.length - 1 ? 0 : "0 0 14px 0",
              fontSize: 11,
              color: "var(--color-term-text)",
              lineHeight: 1.7,
            }}
          >
            {sectionLabels && (() => {
              const chipLabel = sectionLabels[i];
              const { chipColor, chipBg } = chipStyles[chipLabel];
              return (
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: chipColor,
                  background: chipBg,
                  padding: "1px 6px",
                  borderRadius: 2,
                  marginRight: 8,
                  verticalAlign: "middle",
                }}>[{chipLabel}]</span>
              );
            })()}
            {renderWithBoldAndCitations(p, sources)}
          </p>
        ))
      )}
      {data.takeaway && (
        <div style={{
          marginTop: 10,
          padding: "8px 10px",
          borderLeft: `3px solid ${tint.accent}`,
          background: "hsla(220,15%,11%,0.5)",
          fontSize: 11,
          color: "var(--color-term-text)",
          lineHeight: 1.6,
          fontWeight: 500,
        }}>
          <span style={{ color: tint.accent, fontWeight: 700, letterSpacing: "0.08em", marginRight: 8, fontSize: 9 }}>
            POSITIONING ▸
          </span>
          {renderWithBoldAndCitations(data.takeaway, sources)}
        </div>
      )}
      {uniqueSources.length > 0 && (
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: "hsl(220,10%,52%)",
            letterSpacing: "0.04em",
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            alignItems: "baseline",
          }}
        >
          <span style={{ color: "hsl(220,10%,42%)" }}>SOURCES</span>
          {uniqueSources.map((s, i) => (
            <span key={s.host} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ color: "hsl(220,10%,28%)" }}>·</span>}
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "hsl(185,70%,58%)",
                  textDecoration: "none",
                }}
              >
                {s.host}
              </a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
