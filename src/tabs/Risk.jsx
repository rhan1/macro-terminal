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

// ── risk level colors ─────────────────────────────────────────────────────────
const RISK_COLORS = {
  HIGH:     { bg: "hsla(0,72%,55%,0.12)",   border: "hsla(0,72%,55%,0.3)",   text: "hsl(0,72%,55%)"   },
  ELEVATED: { bg: "hsla(45,90%,55%,0.08)",  border: "hsla(45,90%,55%,0.25)", text: "hsl(45,90%,55%)"  },
  MODERATE: { bg: "hsla(142,70%,55%,0.06)", border: "hsla(142,70%,55%,0.2)", text: "hsl(142,70%,55%)" },
  LOW:      { bg: "hsla(142,70%,55%,0.06)", border: "hsla(142,70%,55%,0.2)", text: "hsl(142,70%,55%)" },
  UNKNOWN:  { bg: "hsla(220,10%,30%,0.12)", border: "hsla(220,10%,40%,0.3)", text: "hsl(220,10%,50%)" },
};

// ── heat map category derivation ──────────────────────────────────────────────
function heatMapInfo(category, data) {
  const goldVal = latest(data.GOLD)?.value;
  const cpiVal  = latest(data.CPI)?.value;
  const pceVal  = latest(data.COREPCE)?.value;
  const unrate  = latest(data.UNRATE)?.value;
  const payems  = latest(data.PAYEMS)?.value;
  const hyVal   = latest(data.HYSPREAD)?.value;
  const gdpVal  = latest(data.GDP)?.value;

  switch (category) {
    case "Geopolitical": {
      if (goldVal == null) return { level: "UNKNOWN", desc: "No gold data" };
      if (goldVal > 2500) return { level: "HIGH",     desc: `Gold $${formatNum(goldVal, 0)} — extreme safe-haven bid` };
      if (goldVal > 2200) return { level: "ELEVATED", desc: `Gold $${formatNum(goldVal, 0)} — flight to safety` };
      if (goldVal > 1800) return { level: "MODERATE", desc: `Gold $${formatNum(goldVal, 0)} — modest safe-haven demand` };
      return                     { level: "LOW",      desc: `Gold $${formatNum(goldVal, 0)} — no safe-haven premium` };
    }

    case "Inflation Stickiness": {
      const inf = cpiVal ?? pceVal;
      if (inf == null) return { level: "UNKNOWN", desc: "No inflation data" };
      if (inf > 3)   return { level: "ELEVATED", desc: `CPI/PCE ${formatNum(inf, 1)}% — above 3%, sticky` };
      if (inf > 2.5) return { level: "MODERATE", desc: `CPI/PCE ${formatNum(inf, 1)}% — above target` };
      return                { level: "LOW",      desc: `CPI/PCE ${formatNum(inf, 1)}% — near target` };
    }

    case "Labor Deterioration": {
      if (unrate == null && payems == null) return { level: "UNKNOWN", desc: "No labor data" };
      if (payems != null && payems < 0)    return { level: "HIGH",     desc: `Payrolls ${formatNum(payems, 0)}K — net job losses` };
      if (unrate != null && unrate > 4.5)  return { level: "ELEVATED", desc: `Unemployment ${formatNum(unrate, 1)}% — elevated` };
      return                               { level: "MODERATE", desc: `Unemp ${unrate != null ? formatNum(unrate, 1) : "—"}% — holding` };
    }

    case "Fiscal/Deficit": {
      return { level: "ELEVATED", desc: "Deficit >$1.5T — structural concern" };
    }

    case "Credit Stress": {
      if (hyVal == null) return { level: "UNKNOWN", desc: "No spread data" };
      if (hyVal > 6) return { level: "HIGH",     desc: `HY spread ${formatNum(hyVal, 2)}% — distress signals` };
      if (hyVal > 4) return { level: "ELEVATED", desc: `HY spread ${formatNum(hyVal, 2)}% — stress building` };
      if (hyVal > 3) return { level: "MODERATE", desc: `HY spread ${formatNum(hyVal, 2)}% — modest widening` };
      return                { level: "LOW",      desc: `HY spread ${formatNum(hyVal, 2)}% — tight, benign` };
    }

    case "Financial Conditions": {
      if (hyVal == null) return { level: "UNKNOWN", desc: "No spread data" };
      if (hyVal > 5)   return { level: "HIGH",     desc: `Spreads ${formatNum(hyVal, 2)}% — conditions seized` };
      if (hyVal > 3.5) return { level: "MODERATE", desc: `Spreads ${formatNum(hyVal, 2)}% — some tightening` };
      return                  { level: "LOW",      desc: `Spreads ${formatNum(hyVal, 2)}% — conditions loose` };
    }

    case "Systemic Risk": {
      return { level: "LOW", desc: "No acute systemic signals" };
    }

    case "Growth Momentum": {
      if (gdpVal == null) return { level: "UNKNOWN", desc: "No GDP data" };
      if (gdpVal < 0)   return { level: "HIGH",     desc: `GDP ${formatNum(gdpVal, 1)}% — contraction` };
      if (gdpVal < 1.5) return { level: "ELEVATED", desc: `GDP ${formatNum(gdpVal, 1)}% — stall speed` };
      if (gdpVal > 2.5) return { level: "LOW",      desc: `GDP ${formatNum(gdpVal, 1)}% — solid growth` };
      return                   { level: "MODERATE", desc: `GDP ${formatNum(gdpVal, 1)}% — below trend` };
    }

    default:
      return { level: "UNKNOWN", desc: "No data" };
  }
}

const HEAT_MAP_CATEGORIES = [
  "Geopolitical",
  "Inflation Stickiness",
  "Labor Deterioration",
  "Fiscal/Deficit",
  "Credit Stress",
  "Financial Conditions",
  "Systemic Risk",
  "Growth Momentum",
];

// ── Geopolitical Alert ────────────────────────────────────────────────────────
function GeopoliticalAlert({ goldVal, vixVal }) {
  const goldHigh = goldVal != null && goldVal > 2200;
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

// ── Risk Heat Map ─────────────────────────────────────────────────────────────
function RiskHeatMap({ data }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}
    >
      {HEAT_MAP_CATEGORIES.map((cat) => {
        const { level, desc } = heatMapInfo(cat, data);
        const colors = RISK_COLORS[level] || RISK_COLORS.UNKNOWN;
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
              }}
            >
              {level}
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
    CPI:       { ...SERIES.CPI,       limit: 12 },
    COREPCE:   { ...SERIES.COREPCE,   limit: 12 },
    UNRATE:    { ...SERIES.UNRATE,    limit: 12 },
    PAYEMS:    { ...SERIES.PAYEMS,    limit: 12 },
    GDP:       { ...SERIES.GDP,       limit: 8  },
  });

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Chronological chart arrays
  const vixChart  = [...(data.VIXCLS  || [])].reverse();
  const sentChart = [...(data.UMCSENT || [])].reverse();

  // Derived latest values
  const vixVal   = latest(data.VIXCLS)?.value;
  const vixPrev  = prior(data.VIXCLS)?.value;
  const vixChg   = change(vixVal, vixPrev);

  const sentVal  = latest(data.UMCSENT)?.value;
  const sentPrev = prior(data.UMCSENT)?.value;
  const sentChg  = change(sentVal, sentPrev);

  const goldVal  = latest(data.GOLD)?.value;
  const goldPrev = prior(data.GOLD)?.value;
  const goldChg  = change(goldVal, goldPrev);

  const hyVal    = latest(data.HYSPREAD)?.value;
  const hyPrev   = prior(data.HYSPREAD)?.value;
  const hyChg    = change(hyVal, hyPrev);

  const recVal   = latest(data.RECESSION)?.value;
  const recPrev  = prior(data.RECESSION)?.value;
  const recChg   = change(recVal, recPrev);

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
  const goldSignal = goldVal == null ? "neutral" : goldVal > 2200 ? "bearish" : "neutral";
  const hySignal   = hyVal == null ? "neutral" : hyVal > 5 ? "bearish" : hyVal < 3 ? "bullish" : "neutral";
  const recSignal  = recVal == null ? "neutral" : recVal > 30 ? "bearish" : recVal < 10 ? "bullish" : "neutral";
  const sp500Signal = sp500Chg == null ? "neutral" : sp500Chg >= 0 ? "bullish" : "bearish";

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(142,70%,55%)", letterSpacing: "0.06em" }}>
          $ SENTIMENT &amp; RISK
        </div>
        <div style={{ fontSize: 10, color: "var(--color-term-dim)", marginTop: 2 }}>
          — VIX, Consumer, Gold, Credit, Geopolitical
        </div>
      </div>

      {/* ── Geopolitical Alert (conditional) ───────────────────────────── */}
      <GeopoliticalAlert goldVal={goldVal} vixVal={vixVal} />

      {/* ── VIX + Consumer Sentiment side by side ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

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
            <AreaChart data={vixChart} margin={{ top: 4, right: 40, bottom: 0, left: -20 }}>
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
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-term-dim)", marginBottom: 12 }}>
            Consumer Sentiment
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={sentChart} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
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
              <Area
                type="monotone"
                dataKey="value"
                name="UMich Sentiment"
                stroke="hsl(45,90%,55%)"
                strokeWidth={1.5}
                fill="none"
                dot={false}
                activeDot={{ r: 3, fill: "hsl(45,90%,55%)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Risk Heat Map — Druckenmiller Framework ─────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--color-term-dim)",
            marginBottom: 12,
          }}
        >
          Risk Heat Map — Druckenmiller Framework
        </div>
        <RiskHeatMap data={data} />
      </div>

      {/* ── 6 Indicator Cards (3 x 2) ───────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
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
          detail="CBOE Volatility Index — 30-day implied S&P 500 volatility. Below 18 = calm markets; 18–25 = cautious; above 25 = fear; above 30 = crisis/panic. Spikes: COVID (66), GFC (80)."
          source="CBOE / FRED VIXCLS"
        />
        <IndicatorCard
          label="Consumer Confidence"
          value={sentVal}
          unit=""
          change={sentChg}
          decimals={1}
          signal={sentSignal}
          detail="University of Michigan Consumer Sentiment. Long-run avg ~86. Below 60 = significant pessimism historically preceding spending contractions. All-time low: 50.0 (Jun 2022)."
          source="UMich / FRED UMCSENT"
        />
        <IndicatorCard
          label="Gold (GLD)"
          value={goldVal}
          prefix="$"
          unit=""
          change={goldChg}
          decimals={0}
          signal={goldSignal}
          detail="Gold spot price (USD/troy oz). Above $2,200 signals active safe-haven demand — a bearish risk signal indicating geopolitical or macro stress. All-time high driven by de-dollarization fears."
          source="ICE / FRED GOLDAMGBD228NLBM"
        />
        <IndicatorCard
          label="HY Credit Spreads"
          value={hyVal}
          unit="%"
          change={hyChg}
          decimals={2}
          signal={hySignal}
          detail="ICE BofA High Yield OAS over Treasuries. Below 3% = complacent; 3–5% = stress building; above 5% = bearish; above 6% = distress. Widened to 20%+ during GFC. Leading indicator for defaults."
          source="ICE BofA / FRED BAMLH0A0HYM2"
        />
        <IndicatorCard
          label="Recession Probability"
          value={recVal}
          unit="%"
          change={recChg}
          decimals={1}
          signal={recSignal}
          detail="NY Fed smoothed recession probability from probit model using yield spread. Above 30% = elevated risk; above 40% = historically aligns with confirmed NBER recessions. Lags by ~1 quarter."
          source="NY Fed / FRED RECPROUSM156N"
        />
        <IndicatorCard
          label="S&P 500"
          value={sp500Val}
          unit=""
          change={sp500Chg}
          decimals={2}
          signal={sp500Signal}
          detail="S&P 500 composite index. Drawdowns of 10%+ (correction) or 20%+ (bear market) alongside rising VIX and widening credit spreads signal compounding systemic risk."
          source="S&P / FRED SP500"
        />
      </div>

    </div>
  );
}
