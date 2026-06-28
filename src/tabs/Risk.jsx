import { useEffect, useState } from "react";
import { useFredData } from "../hooks/useFredData";
import { useCbData } from "../hooks/useCbData";
import { SERIES, latest, prior, change, diff, formatNum, formatPct, formatPP } from "../services/fred";
import AsOfPill from "../components/AsOfPill";

// Keep Risk tab gold price aligned with Global tab (Yahoo GC=F futures)
// instead of the FRED Nasdaq Gold Index which tracks a different series.
function useGoldFutures() {
  const [v, setV] = useState(null);
  useEffect(() => {
    let c = false;
    fetch("/api/market?symbols=GC=F")
      .then((r) => r.json())
      .then((d) => { if (!c) setV(d?.["GC=F"] ?? null); })
      .catch(() => {});
    return () => { c = true; };
  }, []);
  return v;
}
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

// ── date helpers ──────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDaily(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtMonthly(dateStr) {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTHS[mi]} ${y}` : `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

function latestHeatMapObservationDate(data) {
  return [
    latest(data.GOLD)?.date,
    latest(data.CPI)?.date,
    latest(data.COREPCE)?.date,
    latest(data.UNRATE)?.date,
    latest(data.PAYEMS)?.date,
    latest(data.HYSPREAD)?.date,
    latest(data.GDP)?.date,
    latest(data.VIXCLS)?.date,
  ]
    .filter(Boolean)
    .reduce((latestDate, candidate) => {
      if (!latestDate) return candidate;
      return new Date(candidate).getTime() > new Date(latestDate).getTime() ? candidate : latestDate;
    }, null);
}

// ── risk level colors ─────────────────────────────────────────────────────────
const RISK_COLORS = {
  HIGH:     { bg: "hsla(0,72%,55%,0.12)",   border: "hsla(0,72%,55%,0.3)",   text: "hsl(0,72%,55%)"   },
  ELEVATED: { bg: "hsla(45,90%,55%,0.08)",  border: "hsla(45,90%,55%,0.25)", text: "hsl(45,90%,55%)"  },
  MODERATE: { bg: "hsla(142,70%,55%,0.06)", border: "hsla(142,70%,55%,0.2)", text: "hsl(142,70%,55%)" },
  LOW:      { bg: "hsla(142,70%,55%,0.06)", border: "hsla(142,70%,55%,0.2)", text: "hsl(142,70%,55%)" },
  UNKNOWN:  { bg: "hsla(220,10%,30%,0.12)", border: "hsla(220,10%,40%,0.3)", text: "hsl(220,10%,50%)" },
};

// ── heat map category derivation ──────────────────────────────────────────────
// overrides.goldVal / overrides.goldPrev allow callers to substitute GC=F
// futures prices (matching GlobalAlert) in place of the FRED NASDAQQGLDI index.
function heatMapInfo(category, data, overrides = {}) {
  const goldVal  = overrides.goldVal  ?? latest(data.GOLD)?.value;
  const goldPrev = overrides.goldPrev ?? prior(data.GOLD)?.value;
  const cpiVal   = latest(data.CPI)?.value;
  const cpiPrev  = prior(data.CPI)?.value;
  const pceVal   = latest(data.COREPCE)?.value;
  const pcePrev  = prior(data.COREPCE)?.value;
  const unrate   = latest(data.UNRATE)?.value;
  const unratePrev = prior(data.UNRATE)?.value;
  const payems   = latest(data.PAYEMS)?.value;
  const payemsPrev = prior(data.PAYEMS)?.value;
  const hyVal    = latest(data.HYSPREAD)?.value;
  const hyPrev   = prior(data.HYSPREAD)?.value;
  const gdpVal   = latest(data.GDP)?.value;
  const gdpPrev  = prior(data.GDP)?.value;

  switch (category) {
    case "Geopolitical": {
      if (goldVal == null) return { level: "UNKNOWN", desc: "No gold data", trend: "stable" };
      const trend = goldPrev == null ? "stable" : goldVal > goldPrev ? "worsening" : goldVal < goldPrev ? "improving" : "stable";
      if (goldVal > 4500) return { level: "HIGH",     desc: `Gold $${formatNum(goldVal, 0)} — extreme safe-haven bid`, trend };
      if (goldVal > 3800) return { level: "ELEVATED", desc: `Gold $${formatNum(goldVal, 0)} — flight to safety`, trend };
      if (goldVal > 3000) return { level: "MODERATE", desc: `Gold $${formatNum(goldVal, 0)} — modest safe-haven demand`, trend };
      return                     { level: "LOW",      desc: `Gold $${formatNum(goldVal, 0)} — no safe-haven premium`, trend };
    }

    case "Inflation Stickiness": {
      const inf     = cpiVal ?? pceVal;
      const infPrev = cpiVal != null ? cpiPrev : pcePrev;
      if (inf == null) return { level: "UNKNOWN", desc: "No inflation data", trend: "stable" };
      const trend = infPrev == null ? "stable" : inf < infPrev ? "improving" : inf > infPrev ? "worsening" : "stable";
      if (inf > 3)   return { level: "ELEVATED", desc: `CPI/PCE ${formatNum(inf, 1)}% — above 3%, sticky`, trend };
      if (inf > 2.5) return { level: "MODERATE", desc: `CPI/PCE ${formatNum(inf, 1)}% — above target`, trend };
      return                { level: "LOW",      desc: `CPI/PCE ${formatNum(inf, 1)}% — near target`, trend };
    }

    case "Labor Deterioration": {
      if (unrate == null && payems == null) return { level: "UNKNOWN", desc: "No labor data", trend: "stable" };
      const trend = unrate != null && unratePrev != null
        ? unrate > unratePrev ? "worsening" : unrate < unratePrev ? "improving" : "stable"
        : payems != null && payemsPrev != null
          ? payems < payemsPrev ? "worsening" : payems > payemsPrev ? "improving" : "stable"
          : "stable";
      if (payems != null && payems < 0)    return { level: "HIGH",     desc: `Payrolls ${formatNum(payems, 0)}K — net job losses`, trend };
      if (unrate != null && unrate > 4.5)  return { level: "ELEVATED", desc: `Unemployment ${formatNum(unrate, 1)}% — elevated`, trend };
      return                               { level: "MODERATE", desc: `Unemp ${unrate != null ? formatNum(unrate, 1) : "—"}% — holding`, trend };
    }

    case "Fiscal/Deficit": {
      const vixV = latest(data.VIXCLS)?.value;
      const vixP = prior(data.VIXCLS)?.value;
      // Use futures price (same source as Geopolitical cell) — thresholds calibrated for spot-equivalent ~$3000–4500.
      const goldV = goldVal;
      const trend = vixV != null && vixP != null ? (vixV > vixP ? "worsening" : vixV < vixP ? "improving" : "stable") : "stable";
      if (vixV != null && vixV > 25 && goldV != null && goldV > 3800) return { level: "HIGH", desc: "VIX + gold signal fiscal stress", trend };
      if ((vixV != null && vixV > 25) || (goldV != null && goldV > 3000)) return { level: "ELEVATED", desc: `Deficit >$1.5T — structural concern`, trend };
      return { level: "MODERATE", desc: "Fiscal deficits persistent but contained", trend };
    }

    case "Credit & Financial Conditions": {
      if (hyVal == null) return { level: "UNKNOWN", desc: "No spread data", trend: "stable" };
      const trend = hyPrev == null ? "stable" : hyVal > hyPrev ? "worsening" : hyVal < hyPrev ? "improving" : "stable";
      if (hyVal > 6) return { level: "HIGH",     desc: `HY spread ${formatNum(hyVal, 2)}% — distress signals`, trend };
      if (hyVal > 4) return { level: "ELEVATED", desc: `HY spread ${formatNum(hyVal, 2)}% — stress building`, trend };
      if (hyVal > 3) return { level: "MODERATE", desc: `HY spread ${formatNum(hyVal, 2)}% — modest widening`, trend };
      return                { level: "LOW",      desc: `HY spread ${formatNum(hyVal, 2)}% — tight, benign`, trend };
    }

    case "Systemic Risk": {
      const vixV = latest(data.VIXCLS)?.value;
      const hyV = latest(data.HYSPREAD)?.value;
      const hyP = prior(data.HYSPREAD)?.value;
      const trend = hyV != null && hyP != null ? (hyV > hyP ? "worsening" : hyV < hyP ? "improving" : "stable") : "stable";
      if ((hyV != null && hyV > 5) || (vixV != null && vixV > 30)) return { level: "HIGH", desc: `Spreads/VIX at crisis levels`, trend };
      if ((hyV != null && hyV > 4) || (vixV != null && vixV > 25)) return { level: "ELEVATED", desc: `HY ${hyV != null ? formatNum(hyV, 1) : "—"}% — stress building`, trend };
      if (hyV != null && hyV > 3) return { level: "MODERATE", desc: `HY ${formatNum(hyV, 1)}% — watch closely`, trend };
      return { level: "LOW", desc: "No acute systemic signals", trend };
    }

    case "Growth Momentum": {
      if (gdpVal == null) return { level: "UNKNOWN", desc: "No GDP data", trend: "stable" };
      const trend = gdpPrev == null ? "stable" : gdpVal > gdpPrev ? "improving" : gdpVal < gdpPrev ? "worsening" : "stable";
      if (gdpVal < 0)   return { level: "HIGH",     desc: `GDP ${formatNum(gdpVal, 1)}% — contraction`, trend };
      if (gdpVal < 1.5) return { level: "ELEVATED", desc: `GDP ${formatNum(gdpVal, 1)}% — stall speed`, trend };
      if (gdpVal > 2.5) return { level: "LOW",      desc: `GDP ${formatNum(gdpVal, 1)}% — solid growth`, trend };
      return                   { level: "MODERATE", desc: `GDP ${formatNum(gdpVal, 1)}% — below trend`, trend };
    }

    default:
      return { level: "UNKNOWN", desc: "No data", trend: "stable" };
  }
}

const HEAT_MAP_CATEGORIES = [
  "Geopolitical",
  "Inflation Stickiness",
  "Labor Deterioration",
  "Fiscal/Deficit",
  "Credit & Financial Conditions",
  "Systemic Risk",
  "Growth Momentum",
];

// ── Geopolitical Alert ────────────────────────────────────────────────────────
function GeopoliticalAlert({ goldVal, vixVal }) {
  const goldHigh = goldVal != null && goldVal > 3800;
  const vixHigh  = vixVal  != null && vixVal  > 25;
  if (!goldHigh && !vixHigh) return null;

  let body = "";
  if (goldHigh && vixHigh) {
    body = `Gold at safe-haven levels ($${formatNum(goldVal, 0)}) signaling flight to safety alongside elevated market volatility (VIX ${formatNum(vixVal, 1)}). Monitor commodity supply chains and energy prices for compounding geopolitical risk factors.`;
  } else if (goldHigh) {
    body = `Gold at safe-haven levels ($${formatNum(goldVal, 0)}) signals active flight to safety. Geopolitical tensions or macro uncertainty appear to be driving demand. Monitor commodity supply chains and energy prices.`;
  } else {
    body = `Market volatility elevated (VIX ${formatNum(vixVal, 1)}) — above fear threshold. Potential for cascading sell-offs. Consider tail-risk positioning and monitor credit spread widening.`;
  }

  return (
    <div
      style={{
        border: "1px solid hsla(0,72%,55%,0.4)",
        background: "hsla(0,72%,55%,0.06)",
        borderRadius: 4,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "hsl(0,72%,55%)",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        GEOPOLITICAL RISK: ELEVATED
      </div>
      <div
        style={{
          fontSize: 10,
          color: "hsla(0,72%,55%,0.85)",
          lineHeight: 1.6,
          letterSpacing: "0.03em",
        }}
      >
        {body}
      </div>
    </div>
  );
}

// ── trend arrow helpers ───────────────────────────────────────────────────────
const TREND_ARROW = {
  improving: { symbol: "↓", color: "hsl(142,70%,55%)" },
  worsening: { symbol: "↑", color: "hsl(0,72%,55%)"   },
  stable:    { symbol: "→", color: "hsl(220,10%,52%)" },
};
// Growth Momentum is inverted: higher GDP = improving
const TREND_ARROW_GROWTH = {
  improving: { symbol: "↗", color: "hsl(142,70%,55%)" },
  worsening: { symbol: "↘", color: "hsl(0,72%,55%)"   },
  stable:    { symbol: "→", color: "hsl(220,10%,52%)" },
};

// ── Risk Heat Map ─────────────────────────────────────────────────────────────
function RiskHeatMap({ data, goldOverrides }) {
  return (
    <div
      className="grid-4"
      style={{
        display: "grid",
        gap: 8,
      }}
    >
      {HEAT_MAP_CATEGORIES.map((cat) => {
        const { level, desc, trend } = heatMapInfo(cat, data, goldOverrides);
        const colors = RISK_COLORS[level] || RISK_COLORS.UNKNOWN;
        const arrowMap = cat === "Growth Momentum" ? TREND_ARROW_GROWTH : TREND_ARROW;
        const arrow = arrowMap[trend] || arrowMap.stable;
        return (
          <div
            key={cat}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              padding: "10px 10px 9px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--color-term-dim)",
                lineHeight: 1.2,
              }}
            >
              {cat}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.text,
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {level}
              <span style={{ fontSize: 12, color: arrow.color, fontWeight: 400 }}>
                {arrow.symbol}
              </span>
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--color-term-dim)",
                lineHeight: 1.4,
              }}
            >
              {desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Risk() {
  const { data, loading, error } = useFredData({
    VIXCLS:    { ...SERIES.VIXCLS,    limit: 60 },
    UMCSENT:   { ...SERIES.UMCSENT,   limit: 24 },
    GOLD:      { ...SERIES.GOLD,      limit: 60 },
    HYSPREAD:  { ...SERIES.HYSPREAD,  limit: 60 },
    RECESSION: { ...SERIES.RECESSION, limit: 12 },
    SP500:     { ...SERIES.SP500,     limit: 60 },
    WALCL:     { ...SERIES.WALCL,     limit: 52 },
    RRPONTSYD: { ...SERIES.RRPONTSYD, limit: 30 },
    CPI:       { ...SERIES.CPI,       limit: 12 },
    COREPCE:   { ...SERIES.COREPCE,   limit: 12 },
    UNRATE:    { ...SERIES.UNRATE,    limit: 12 },
    PAYEMS:    { ...SERIES.PAYEMS,    limit: 12 },
    GDP:       { ...SERIES.GDP,       limit: 8  },
  });
  const { data: cbData, loading: cbLoading } = useCbData();
  const cbVal = cbData?.value ?? null;
  const goldFut = useGoldFutures();

  if (loading && Object.keys(data).length === 0) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Chronological chart arrays
  const vixChart  = [...(data.VIXCLS  || [])].reverse();
  const sentChartRaw = [...(data.UMCSENT || [])].reverse();
  // Merge CB current + prior into the last two months so both plot on the same chart
  const sentChart = sentChartRaw.map((pt, i) => {
    if (i === sentChartRaw.length - 1 && cbVal != null) {
      return { ...pt, cbValue: cbVal };
    }
    if (i === sentChartRaw.length - 2 && cbData?.prior != null) {
      return { ...pt, cbValue: cbData.prior };
    }
    return pt;
  });
  const hyChart   = [...(data.HYSPREAD || [])].reverse();

  // Derived latest values
  const vixVal   = latest(data.VIXCLS)?.value;
  const heatMapDate = latestHeatMapObservationDate(data);
  const vixPrev  = prior(data.VIXCLS)?.value;
  const vixChg   = change(vixVal, vixPrev);

  const sentVal  = latest(data.UMCSENT)?.value;
  const sentPrev = prior(data.UMCSENT)?.value;
  const sentChg  = change(sentVal, sentPrev);

  // Prefer Yahoo GC=F futures (matches Global tab) with FRED fallback.
  const fredGoldVal = latest(data.GOLD)?.value;
  const fredGoldPrev = prior(data.GOLD)?.value;
  const goldVal  = goldFut?.price ?? fredGoldVal;
  const goldPrev = goldFut?.prevClose ?? fredGoldPrev;
  const goldChg  = goldFut?.changePct != null ? goldFut.changePct : change(fredGoldVal, fredGoldPrev);

  const hyVal    = latest(data.HYSPREAD)?.value;
  const hyPrev   = prior(data.HYSPREAD)?.value;
  const hyChg    = change(hyVal, hyPrev);

  const recVal   = latest(data.RECESSION)?.value;
  const recPrev  = prior(data.RECESSION)?.value;
  const recChg   = diff(recVal, recPrev);

  const sp500Val  = latest(data.SP500)?.value;
  const sp500Prev = prior(data.SP500)?.value;
  const sp500Chg  = change(sp500Val, sp500Prev);

  // VIX chart value label
  const vixLabel = vixVal != null ? formatNum(vixVal, 2) : "—";
  const vixArrow = vixChg == null ? "" : vixChg >= 0 ? " ▲" : " ▼";
  const vixChgStr = vixChg != null ? `${vixArrow} ${formatNum(Math.abs(vixChg), 1)}%` : "";

  // Indicator signals
  const vixSignal  = vixVal == null ? "neutral" : vixVal > 25 ? "bearish" : vixVal < 18 ? "bullish" : "neutral";
  const sentSignal = sentVal == null ? "neutral" : sentVal < 60 ? "bearish" : sentVal > 80 ? "bullish" : "neutral";
  const goldSignal = goldVal == null ? "neutral" : goldVal > 3800 ? "bearish" : "neutral";
  const hySignal   = hyVal == null ? "neutral" : hyVal > 5 ? "bearish" : hyVal < 3 ? "bullish" : "neutral";
  const recSignal  = recVal == null ? "neutral" : recVal > 30 ? "bearish" : recVal < 10 ? "bullish" : "neutral";
  const sp500Signal = sp500Chg == null ? "neutral" : sp500Chg >= 0 ? "bullish" : "bearish";

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(142,70%,55%)", letterSpacing: "0.06em" }}>
          $ RISK &amp; VOLATILITY
        </div>
        <div style={{ fontSize: 10, color: "var(--color-term-dim)", marginTop: 2 }}>
          — VIX, Consumer, Gold, Credit, Geopolitical
        </div>
      </div>

      {/* ── Geopolitical Alert (conditional) ───────────────────────────── */}
      <GeopoliticalAlert goldVal={goldVal} vixVal={vixVal} />

      {/* ── VIX + Consumer Sentiment side by side ───────────────────────── */}
      <div className="grid-2" style={{ display: "grid", gap: 16 }}>

        {/* Left: VIX */}
        <div
          className="panel"
          style={{ padding: "14px 16px" }}
        >
          {/* Panel header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-term-dim)" }}>
              CBOE Volatility Index (VIX)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "hsl(45,90%,55%)", fontVariantNumeric: "tabular-nums" }}>
                {vixLabel}
              </span>
              <span style={{ fontSize: 10, color: vixChg != null && vixChg < 0 ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)" }}>
                {vixChgStr}
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={vixChart} margin={{ top: 4, right: 40, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor="hsl(45,90%,55%)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(45,90%,55%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-term-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDaily}
                tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatNum(v, 2)} />} />
              <ReferenceLine
                y={20}
                stroke="hsl(142,70%,55%)"
                strokeDasharray="4 4"
                label={{ value: "Normal <20", position: "right", fill: "hsl(142,70%,55%)", fontSize: 9 }}
              />
              <ReferenceLine
                y={30}
                stroke="hsl(0,72%,55%)"
                strokeDasharray="4 4"
                label={{ value: "Fear >30", position: "right", fill: "hsl(0,72%,55%)", fontSize: 9 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="VIX"
                stroke="hsl(45,90%,55%)"
                strokeWidth={2}
                fill="url(#vixGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "hsl(45,90%,55%)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Consumer Sentiment */}
        <div
          className="panel"
          style={{ padding: "14px 16px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-term-dim)" }}>
                Consumer Sentiment
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: "hsl(185,70%,55%)", fontVariantNumeric: "tabular-nums" }}>
                  CB: {cbVal != null ? formatNum(cbVal, 1) : "—"}
                </span>
                <span style={{ fontSize: 11, color: "hsl(45,90%,55%)", fontVariantNumeric: "tabular-nums" }}>
                  UMich: {sentVal != null ? formatNum(sentVal, 1) : "—"}
                </span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={sentChart} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--color-term-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMonthly}
                tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--color-term-dim)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatNum(v, 1)} />} />
              <ReferenceLine
                y={86}
                stroke="hsl(220,10%,52%)"
                strokeDasharray="4 4"
                label={{ value: "Avg ~86", position: "right", fill: "hsl(220,10%,52%)", fontSize: 9 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="UMich"
                stroke="hsl(45,90%,55%)"
                strokeWidth={1.5}
                fill="none"
                dot={false}
                activeDot={{ r: 3, fill: "hsl(45,90%,55%)" }}
              />
              <Line
                type="monotone"
                dataKey="cbValue"
                name="CB Confidence"
                stroke="hsl(185,70%,55%)"
                strokeWidth={1.5}
                dot={{ r: 3, fill: "hsl(185,70%,55%)" }}
                activeDot={{ r: 4, fill: "hsl(185,70%,55%)" }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HY Credit Spreads */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-term-dim)" }}>
            High Yield Credit Spreads (OAS)
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "hsl(45,90%,55%)", fontVariantNumeric: "tabular-nums" }}>
              {hyVal != null ? `${formatNum(hyVal, 2)}%` : "—"}
            </span>
            {hyChg != null && (
              <span style={{ fontSize: 10, color: hyChg > 0 ? "hsl(0,72%,55%)" : "hsl(142,70%,55%)" }}>
                {hyChg >= 0 ? "▲" : "▼"} {formatNum(Math.abs(hyChg), 1)}%
              </span>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={hyChart} margin={{ top: 4, right: 40, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="hyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="20%" stopColor="hsl(45,90%,55%)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(45,90%,55%)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-term-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDaily} tick={{ fill: "var(--color-term-dim)", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "var(--color-term-dim)", fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTooltip formatter={(v) => `${formatNum(v, 2)}%`} />} />
            <ReferenceLine y={4} stroke="hsl(45,90%,55%)" strokeDasharray="4 4" label={{ value: "Stress >4%", position: "right", fill: "hsl(45,90%,55%)", fontSize: 9 }} />
            <ReferenceLine y={6} stroke="hsl(0,72%,55%)" strokeDasharray="4 4" label={{ value: "Distress >6%", position: "right", fill: "hsl(0,72%,55%)", fontSize: 9 }} />
            <Area type="monotone" dataKey="value" name="HY Spread" stroke="hsl(45,90%,55%)" strokeWidth={2} fill="url(#hyGrad)" dot={false} activeDot={{ r: 3, fill: "hsl(45,90%,55%)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Risk Heat Map — Druckenmiller Framework ─────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--color-term-dim)",
            }}
          >
            Risk Heat Map — Druckenmiller Framework
          </div>
          {heatMapDate && <AsOfPill date={heatMapDate} />}
        </div>
        <RiskHeatMap data={data} goldOverrides={{ goldVal: goldFut?.price ?? fredGoldVal, goldPrev: goldFut?.prevClose ?? fredGoldPrev }} />
      </div>

      {/* ── Indicator Cards ─────────────────────────────────────────────── */}
      <div
        className="grid-3"
        style={{
          display: "grid",
          gap: 12,
        }}
      >
        <IndicatorCard
          label="VIX"
          value={vixVal}
          unit=""
          change={vixChg}
          decimals={2}
          signal={vixSignal}
          detail="CBOE Volatility Index — 30-day implied S&P 500 volatility derived from options prices. Below 18 = calm markets; 18–25 = cautious; above 25 = fear; above 30 = crisis/panic. Historical spikes: COVID (66), GFC (80). Mean-reverting — sustained VIX above 30 is rare outside crisis periods."
          source="CBOE / FRED VIXCLS"
          sourceUrl="https://fred.stlouisfed.org/series/VIXCLS"
          dateLabel={fmtCardDate(latest(data.VIXCLS)?.date)}
          sparkData={data.VIXCLS?.slice(0, 12)}
        />
        <IndicatorCard
          label="Gold (GC=F)"
          value={goldVal}
          prefix="$"
          unit=""
          change={goldChg}
          decimals={0}
          signal={goldSignal}
          detail="Gold futures price (USD/troy oz, GC=F front-month). Above $3,800 signals active safe-haven demand — a bearish risk signal indicating geopolitical or macro stress. Central bank buying (esp. China, India) and de-dollarization flows have driven structural demand. Gold correlates inversely with real yields — falling real rates are bullish for gold."
          source="Yahoo Finance GC=F"
          sourceUrl="https://finance.yahoo.com/quote/GC=F"
          dateLabel={goldFut?.date ? fmtCardDate(goldFut.date) : fmtCardDate(latest(data.GOLD)?.date)}
          sparkData={data.GOLD?.slice(0, 12)}
        />
        <IndicatorCard
          label="HY Credit Spreads"
          value={hyVal}
          unit="%"
          change={hyChg}
          decimals={2}
          signal={hySignal}
          detail="ICE BofA High Yield OAS over Treasuries. Below 3% = complacent risk-on; 3–5% = stress building; above 5% = bearish; above 6% = distress. Widened to 20%+ during GFC. A leading indicator for corporate default rates — spread widening historically precedes earnings deterioration by 2–3 quarters."
          source="ICE BofA / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/BAMLH0A0HYM2"
          dateLabel={fmtCardDate(latest(data.HYSPREAD)?.date)}
          sparkData={data.HYSPREAD?.slice(0, 12)}
        />
        <IndicatorCard
          label="Recession Probability"
          value={recVal}
          unit="%"
          change={recChg}
          changeLabel={recChg != null ? formatPP(recChg, 1) : undefined}
          decimals={1}
          signal={recSignal}
          detail="NY Fed smoothed recession probability from a probit model using the 10Y-3M Treasury spread. Above 30% = elevated risk; above 40% = historically aligns with confirmed NBER recession dates. The model has predicted all 8 recessions since 1960. Lags by ~1 quarter due to data reporting delays."
          source="NY Fed / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/RECPROUSM156N"
          dateLabel={fmtCardDate(latest(data.RECESSION)?.date)}
          sparkData={data.RECESSION?.slice(0, 12)}
        />
        <IndicatorCard
          label="S&P 500"
          value={sp500Val}
          unit=""
          change={sp500Chg}
          decimals={2}
          signal={sp500Signal}
          detail="S&P 500 composite index — 500 large-cap US equities weighted by market capitalization. Drawdowns of 10%+ (correction) or 20%+ (bear market) alongside rising VIX and widening credit spreads signal compounding systemic risk. The index accounts for ~80% of total US equity market cap. Forward P/E and earnings growth trajectory are the primary valuation anchors."
          source="S&P / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/SP500"
          dateLabel={fmtCardDate(latest(data.SP500)?.date)}
          sparkData={data.SP500?.slice(0, 12)}
        />
        <IndicatorCard
          label="Fed Balance Sheet"
          value={latest(data.WALCL || [])?.value != null ? latest(data.WALCL || []).value / 1000000 : null}
          unit="T"
          prefix="$"
          decimals={2}
          change={change(latest(data.WALCL || [])?.value, prior(data.WALCL || [])?.value)}
          direction={change(latest(data.WALCL || [])?.value, prior(data.WALCL || [])?.value) == null ? "flat" : change(latest(data.WALCL || [])?.value, prior(data.WALCL || [])?.value) > 0 ? "up" : "down"}
          signal="neutral"
          detail="Total Federal Reserve assets (WALCL). Peak was $8.97T in Apr 2022. QT has been shrinking the balance sheet since Jun 2022. Faster runoff drains liquidity and tightens financial conditions. Slowdown/pause signals policy pivot."
          source="Fed / FRED WALCL"
          sourceUrl="https://fred.stlouisfed.org/series/WALCL"
          dateLabel={fmtCardDate(latest(data.WALCL || [])?.date)}
          sparkData={(data.WALCL || [])?.slice(0, 12)}
        />
        {(() => {
          const rrpRaw = latest(data.RRPONTSYD || [])?.value;
          const rrpPrevRaw = prior(data.RRPONTSYD || [])?.value;
          // Use $B with 2 decimals so near-zero values (e.g. $0.04B) show correctly.
          const rrpVal = rrpRaw != null ? rrpRaw / 1000 : null;
          const rrpChg = change(rrpRaw, rrpPrevRaw);
          // Suppress % change when prior value is tiny (< $5B raw = 5000 in FRED units)
          // to avoid misleading triple-digit swings on near-zero balances.
          const rrpChgSafe = rrpPrevRaw != null && Math.abs(rrpPrevRaw) < 5000 ? null : rrpChg;
          return (
        <IndicatorCard
          label="Reverse Repo"
          value={rrpVal}
          unit="B"
          prefix="$"
          decimals={2}
          change={rrpChg}
          changeLabel={rrpChgSafe != null ? formatPct(rrpChgSafe) : "—"}
          direction={rrpChg == null ? "flat" : rrpChg > 0 ? "up" : "down"}
          signal="neutral"
          detail="Overnight reverse repo facility usage (RRPONTSYD). High usage = excess liquidity parked at the Fed. Declining RRP = liquidity draining into Treasuries or risk assets. Near-zero RRP means the liquidity buffer is exhausted."
          source="NY Fed / FRED RRPONTSYD"
          sourceUrl="https://fred.stlouisfed.org/series/RRPONTSYD"
          dateLabel={fmtCardDate(latest(data.RRPONTSYD || [])?.date)}
          sparkData={(data.RRPONTSYD || [])?.slice(0, 12)}
        />
          );
        })()}
      </div>

    </div>
  );
}
