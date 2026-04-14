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

// ── date helpers ─────────────────────────────────────────────────────────────
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

// ── risk level + description derivation ──────────────────────────────────────
function riskInfo(category, data) {
  const vixLatest  = latest(data.VIXCLS)?.value;
  const hyLatest   = latest(data.HYSPREAD)?.value;
  const recLatest  = latest(data.RECESSION)?.value;
  const sentLatest = latest(data.UMCSENT)?.value;
  const goldLatest = latest(data.GOLD)?.value;
  const sp500      = data.SP500;

  switch (category) {
    case "Market Volatility": {
      if (vixLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (vixLatest > 35) return { level: "HIGH",     desc: `VIX ${formatNum(vixLatest, 1)} — panic/crisis territory` };
      if (vixLatest > 25) return { level: "ELEVATED", desc: `VIX ${formatNum(vixLatest, 1)} — above fear threshold` };
      if (vixLatest > 18) return { level: "MODERATE", desc: `VIX ${formatNum(vixLatest, 1)} — mild uncertainty` };
      return                     { level: "LOW",      desc: `VIX ${formatNum(vixLatest, 1)} — markets calm` };
    }

    case "Credit Stress": {
      if (hyLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (hyLatest > 6) return { level: "HIGH",     desc: `HY spread ${formatNum(hyLatest, 2)}% — distress signals` };
      if (hyLatest > 4) return { level: "ELEVATED", desc: `HY spread ${formatNum(hyLatest, 2)}% — stress building` };
      if (hyLatest > 3) return { level: "MODERATE", desc: `HY spread ${formatNum(hyLatest, 2)}% — modest widening` };
      return                   { level: "LOW",      desc: `HY spread ${formatNum(hyLatest, 2)}% — tight, benign` };
    }

    case "Recession Risk": {
      if (recLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (recLatest > 40) return { level: "HIGH",     desc: `${formatNum(recLatest, 1)}% prob — historically recessionary` };
      if (recLatest > 20) return { level: "ELEVATED", desc: `${formatNum(recLatest, 1)}% prob — meaningfully elevated` };
      if (recLatest > 10) return { level: "MODERATE", desc: `${formatNum(recLatest, 1)}% prob — above baseline` };
      return                     { level: "LOW",      desc: `${formatNum(recLatest, 1)}% prob — below baseline` };
    }

    case "Consumer Sentiment": {
      if (sentLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (sentLatest < 55) return { level: "HIGH",     desc: `Index ${formatNum(sentLatest, 1)} — deeply pessimistic` };
      if (sentLatest < 65) return { level: "ELEVATED", desc: `Index ${formatNum(sentLatest, 1)} — significant weakness` };
      if (sentLatest < 75) return { level: "MODERATE", desc: `Index ${formatNum(sentLatest, 1)} — below average` };
      return                      { level: "LOW",      desc: `Index ${formatNum(sentLatest, 1)} — healthy consumer` };
    }

    case "Gold Signal": {
      if (goldLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (goldLatest > 2500) return { level: "HIGH",     desc: `$${formatNum(goldLatest, 0)} — extreme safe-haven bid` };
      if (goldLatest > 2200) return { level: "ELEVATED", desc: `$${formatNum(goldLatest, 0)} — flight to safety` };
      if (goldLatest > 1700) return { level: "MODERATE", desc: `$${formatNum(goldLatest, 0)} — moderate safe-haven demand` };
      return                        { level: "LOW",      desc: `$${formatNum(goldLatest, 0)} — no safe-haven premium` };
    }

    case "Financial Conditions": {
      if (hyLatest == null) return { level: "UNKNOWN", desc: "No data" };
      if (hyLatest > 7)   return { level: "HIGH",     desc: `Spreads ${formatNum(hyLatest, 2)}% — conditions seized` };
      if (hyLatest > 5)   return { level: "ELEVATED", desc: `Spreads ${formatNum(hyLatest, 2)}% — tightening fast` };
      if (hyLatest > 3.5) return { level: "MODERATE", desc: `Spreads ${formatNum(hyLatest, 2)}% — some tightening` };
      return                     { level: "LOW",      desc: `Spreads ${formatNum(hyLatest, 2)}% — conditions loose` };
    }

    case "Equity Risk": {
      if (!sp500 || sp500.length < 20) return { level: "UNKNOWN", desc: "Insufficient history" };
      const now  = sp500[0].value;
      const then = sp500[Math.min(19, sp500.length - 1)].value;
      const pct  = ((now - then) / Math.abs(then)) * 100;
      if (pct < -10) return { level: "HIGH",     desc: `20D return ${formatNum(pct, 1)}% — sharp drawdown` };
      if (pct < -5)  return { level: "ELEVATED", desc: `20D return ${formatNum(pct, 1)}% — meaningful decline` };
      if (pct < 0)   return { level: "MODERATE", desc: `20D return ${formatNum(pct, 1)}% — slight weakness` };
      return               { level: "LOW",      desc: `20D return +${formatNum(pct, 1)}% — trending up` };
    }

    case "Systemic Risk":
    default:
      return { level: "LOW", desc: "No acute signals" };
  }
}

const RISK_COLORS = {
  HIGH:     { bg: "rgba(239,68,68,0.15)",  border: "#ef4444", label: "#ef4444"  },
  ELEVATED: { bg: "rgba(234,179,8,0.12)",  border: "#eab308", label: "#eab308"  },
  MODERATE: { bg: "rgba(74,222,128,0.07)", border: "#22543d", label: "#4ade80"  },
  LOW:      { bg: "rgba(74,222,128,0.10)", border: "#4ade80", label: "#4ade80"  },
  UNKNOWN:  { bg: "rgba(90,99,118,0.12)",  border: "#5a6376", label: "#5a6376"  },
};

const RISK_CATEGORIES = [
  "Market Volatility",
  "Credit Stress",
  "Recession Risk",
  "Consumer Sentiment",
  "Gold Signal",
  "Financial Conditions",
  "Equity Risk",
  "Systemic Risk",
];

// ── Geopolitical Risk Alert ───────────────────────────────────────────────────
function GeopoliticalAlert({ goldVal, vixVal }) {
  const goldHigh = goldVal != null && goldVal > 2200;
  const vixHigh  = vixVal  != null && vixVal  > 30;

  if (!goldHigh && !vixHigh) return null;

  const messages = [];
  if (goldHigh && vixHigh) {
    messages.push(
      `ELEVATED GEOPOLITICAL RISK — Gold at safe-haven levels ($${formatNum(goldVal, 0)}), signaling flight to safety. Monitor commodity supply chains and energy prices.`
    );
    messages.push(
      `MARKET STRESS — VIX at crisis levels indicating extreme fear and potential for cascading sell-offs.`
    );
  } else if (goldHigh) {
    messages.push(
      `ELEVATED GEOPOLITICAL RISK — Gold at safe-haven levels ($${formatNum(goldVal, 0)}), signaling flight to safety. Monitor commodity supply chains and energy prices.`
    );
  } else {
    messages.push(
      `MARKET STRESS — VIX at crisis levels indicating extreme fear and potential for cascading sell-offs.`
    );
  }

  return (
    <div
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.50)",
        borderLeft: "3px solid #ef4444",
        borderRadius: 4,
        padding: "11px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              lineHeight: 1,
              marginTop: 1,
              color: "#ef4444",
              flexShrink: 0,
            }}
          >
            ⚠
          </span>
          <span
            style={{
              fontSize: 10,
              color: "rgba(239,68,68,0.90)",
              letterSpacing: "0.04em",
              lineHeight: 1.5,
            }}
          >
            {msg}
          </span>
        </div>
      ))}
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
      {RISK_CATEGORIES.map((cat) => {
        const { level, desc } = riskInfo(cat, data);
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
              gap: 5,
            }}
          >
            <div
              style={{
                fontSize: 8,
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
                fontWeight: 700,
                color: colors.label,
                letterSpacing: "0.06em",
              }}
            >
              {level}
            </div>
            <div
              style={{
                fontSize: 8,
                color: "var(--color-term-dim)",
                lineHeight: 1.4,
                marginTop: 1,
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

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div
      className="section-label"
      style={{
        fontSize: 9,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-term-dim)",
        marginBottom: 10,
      }}
    >
      {children}
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
  });

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Chronological chart arrays
  const vixChart  = [...(data.VIXCLS  || [])].reverse();
  const sentChart = [...(data.UMCSENT || [])].reverse();

  // Derived values
  const vixVal  = latest(data.VIXCLS)?.value;
  const vixPrev = prior(data.VIXCLS)?.value;

  const sentVal  = latest(data.UMCSENT)?.value;
  const sentPrev = prior(data.UMCSENT)?.value;

  const goldVal  = latest(data.GOLD)?.value;
  const goldPrev = prior(data.GOLD)?.value;

  const hyVal  = latest(data.HYSPREAD)?.value;
  const hyPrev = prior(data.HYSPREAD)?.value;

  const recVal  = latest(data.RECESSION)?.value;
  const recPrev = prior(data.RECESSION)?.value;

  const sp500Val  = latest(data.SP500)?.value;
  const sp500Prev = prior(data.SP500)?.value;

  const vixChange   = change(vixVal,   vixPrev);
  const sentChange  = change(sentVal,  sentPrev);
  const goldChange  = change(goldVal,  goldPrev);
  const hyChange    = change(hyVal,    hyPrev);
  const recChange   = change(recVal,   recPrev);
  const sp500Change = change(sp500Val, sp500Prev);

  // VIX area color
  const vixAreaColor =
    vixVal >= 30 ? "var(--color-term-red)"   :
    vixVal >= 20 ? "var(--color-term-amber)"  :
                   "var(--color-term-green)";

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Geopolitical Alert ──────────────────────────────────────────── */}
      <GeopoliticalAlert goldVal={goldVal} vixVal={vixVal} />

      {/* ── VIX + Consumer Sentiment side by side ───────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {/* VIX chart */}
        <div className="panel" style={{ padding: "14px 16px" }}>
          <SectionLabel>VIX — Volatility Index (60D)</SectionLabel>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={vixChart} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={vixAreaColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={vixAreaColor} stopOpacity={0.02} />
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
                stroke="var(--color-term-green)"
                strokeDasharray="4 4"
                label={{ value: "NORMAL 20", position: "right", fill: "var(--color-term-green)", fontSize: 8 }}
              />
              <ReferenceLine
                y={30}
                stroke="var(--color-term-red)"
                strokeDasharray="4 4"
                label={{ value: "FEAR 30", position: "right", fill: "var(--color-term-red)", fontSize: 8 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="VIX"
                stroke={vixAreaColor}
                strokeWidth={1.5}
                fill="url(#vixGrad)"
                dot={false}
                activeDot={{ r: 3, fill: vixAreaColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Consumer Sentiment chart */}
        <div className="panel" style={{ padding: "14px 16px" }}>
          <SectionLabel>UMich Consumer Sentiment (24M)</SectionLabel>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={sentChart} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
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
                y={65}
                stroke="var(--color-term-amber)"
                strokeDasharray="4 4"
                label={{ value: "WEAK 65", position: "right", fill: "var(--color-term-amber)", fontSize: 8 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name="Sentiment"
                stroke="var(--color-term-cyan)"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-term-cyan)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Risk Heat Map ────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <SectionLabel>Risk Heat Map</SectionLabel>
        <RiskHeatMap data={data} />
      </div>

      {/* ── Key Risk Indicator Cards (3x2) ──────────────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <SectionLabel>Key Risk Indicators</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <IndicatorCard
            label="VIX Fear Gauge"
            value={vixVal}
            unit=""
            change={vixChange}
            decimals={2}
            detail="CBOE Volatility Index measuring 30-day implied S&P volatility. Below 20 = calm; 20–30 = elevated fear; above 30 = crisis/panic. Historical spikes: COVID (66), GFC (80), 9/11 (43)."
            source="CBOE / FRED VIXCLS"
          />
          <IndicatorCard
            label="Consumer Sentiment"
            value={sentVal}
            unit=""
            change={sentChange}
            decimals={1}
            detail="University of Michigan Consumer Sentiment. Long-run avg ~86. Below 65 = significant pessimism historically preceding spending contractions. All-time low: 50.0 (Jun 2022)."
            source="UMich / FRED UMCSENT"
          />
          <IndicatorCard
            label="Gold"
            value={goldVal}
            unit="$"
            change={goldChange}
            decimals={0}
            detail="Gold spot price (USD/troy oz). Above $2,200 signals active safe-haven demand. Rising gold alongside rising rates or equities is a warning flag for geopolitical or tail-risk events."
            source="ICE / FRED GOLDAMGBD228NLBM"
          />
          <IndicatorCard
            label="HY Credit Spread"
            value={hyVal}
            unit="%"
            change={hyChange}
            decimals={2}
            detail="ICE BofA High Yield OAS over Treasuries. Below 3% = tight/complacent; 4–6% = stress building; above 6% = distress. Widened to 20%+ during GFC. Leading indicator for defaults."
            source="ICE BofA / FRED BAMLH0A0HYM2"
          />
          <IndicatorCard
            label="Recession Probability"
            value={recVal}
            unit="%"
            change={recChange}
            decimals={1}
            detail="NY Fed smoothed recession probability from probit model using yield spread. Above 20% = elevated; above 40% = historically aligns with confirmed NBER recessions. Lags by ~1 quarter."
            source="NY Fed / FRED RECPROUSM156N"
          />
          <IndicatorCard
            label="S&P 500"
            value={sp500Val}
            unit=""
            change={sp500Change}
            decimals={2}
            detail="S&P 500 composite index level. Drawdowns of 10%+ (correction) or 20%+ (bear market) alongside rising VIX and widening credit spreads indicate compounding systemic risk."
            source="S&P / FRED SP500"
          />
        </div>
      </div>

    </div>
  );
}
