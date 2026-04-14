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

// ── date helpers ────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDaily(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${d}`;
}

function fmtMonthly(dateStr) {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

// ── risk level derivation ────────────────────────────────────────────────────
function riskLevel(category, data) {
  const vixLatest  = latest(data.VIXCLS)?.value;
  const hyLatest   = latest(data.HYSPREAD)?.value;
  const recLatest  = latest(data.RECESSION)?.value;
  const sentLatest = latest(data.UMCSENT)?.value;
  const goldLatest = latest(data.GOLD)?.value;
  const sp500      = data.SP500;

  switch (category) {
    case "Market Volatility":
      if (vixLatest == null) return "UNKNOWN";
      if (vixLatest > 35) return "HIGH";
      if (vixLatest > 25) return "ELEVATED";
      if (vixLatest > 18) return "MODERATE";
      return "LOW";

    case "Credit Stress":
      if (hyLatest == null) return "UNKNOWN";
      if (hyLatest > 6) return "HIGH";
      if (hyLatest > 4) return "ELEVATED";
      if (hyLatest > 3) return "MODERATE";
      return "LOW";

    case "Recession Risk":
      if (recLatest == null) return "UNKNOWN";
      if (recLatest > 40) return "HIGH";
      if (recLatest > 20) return "ELEVATED";
      if (recLatest > 10) return "MODERATE";
      return "LOW";

    case "Consumer Sentiment":
      if (sentLatest == null) return "UNKNOWN";
      if (sentLatest < 55) return "HIGH";
      if (sentLatest < 65) return "ELEVATED";
      if (sentLatest < 75) return "MODERATE";
      return "LOW";

    case "Gold Signal":
      if (goldLatest == null) return "UNKNOWN";
      if (goldLatest > 2500) return "HIGH";
      if (goldLatest > 2000) return "ELEVATED";
      if (goldLatest > 1700) return "MODERATE";
      return "LOW";

    case "Financial Conditions":
      // Inverse of HY spread — tight spreads = good conditions = LOW risk
      if (hyLatest == null) return "UNKNOWN";
      if (hyLatest > 7) return "HIGH";
      if (hyLatest > 5) return "ELEVATED";
      if (hyLatest > 3.5) return "MODERATE";
      return "LOW";

    case "Equity Risk": {
      if (!sp500 || sp500.length < 20) return "UNKNOWN";
      const now  = sp500[0].value;
      const then = sp500[Math.min(19, sp500.length - 1)].value;
      const pct  = ((now - then) / Math.abs(then)) * 100;
      if (pct < -10) return "HIGH";
      if (pct < -5)  return "ELEVATED";
      if (pct < 0)   return "MODERATE";
      return "LOW";
    }

    case "Systemic Risk":
    default:
      return "LOW";
  }
}

const RISK_COLORS = {
  HIGH:     { bg: "rgba(239,68,68,0.18)",  border: "#ef4444", text: "#ef4444"  },
  ELEVATED: { bg: "rgba(234,179,8,0.15)",  border: "#eab308", text: "#eab308"  },
  MODERATE: { bg: "rgba(74,222,128,0.08)", border: "#22543d", text: "#4ade80"  },
  LOW:      { bg: "rgba(74,222,128,0.12)", border: "#4ade80", text: "#4ade80"  },
  UNKNOWN:  { bg: "rgba(90,99,118,0.15)",  border: "#5a6376", text: "#5a6376"  },
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

// ── subcomponents ────────────────────────────────────────────────────────────
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
        const level  = riskLevel(cat, data);
        const colors = RISK_COLORS[level] || RISK_COLORS.UNKNOWN;
        return (
          <div
            key={cat}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 3,
              padding: "10px 10px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-term-dim)",
                lineHeight: 1.3,
              }}
            >
              {cat}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.text,
                letterSpacing: "0.06em",
              }}
            >
              {level}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export default function Risk() {
  const { data, loading, error } = useFredData({
    VIXCLS:   { ...SERIES.VIXCLS,   limit: 60 },
    UMCSENT:  { ...SERIES.UMCSENT,  limit: 24 },
    GOLD:     { ...SERIES.GOLD,     limit: 60 },
    HYSPREAD: { ...SERIES.HYSPREAD, limit: 60 },
    RECESSION:{ ...SERIES.RECESSION,limit: 12 },
    SP500:    { ...SERIES.SP500,    limit: 60 },
  });

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-term-red)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // Reverse arrays for chronological chart display (newest-first → oldest-first)
  const vixChart  = [...(data.VIXCLS   || [])].reverse();
  const sentChart = [...(data.UMCSENT  || [])].reverse();

  // Indicator values
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

  // VIX color: red if >= 30, amber if >= 20, else green
  const vixAreaColor =
    vixVal >= 30 ? "var(--color-term-red)" :
    vixVal >= 20 ? "var(--color-term-amber)" :
    "var(--color-term-green)";

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── VIX Chart ─────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <SectionLabel>VIX — Volatility Index (60D)</SectionLabel>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart
            data={vixChart}
            margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
          >
            <defs>
              <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={vixAreaColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={vixAreaColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--color-term-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
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
            <Tooltip
              content={<ChartTooltip formatter={(v) => formatNum(v, 2)} />}
            />
            <ReferenceLine
              y={20}
              stroke="var(--color-term-green)"
              strokeDasharray="4 4"
              label={{
                value: "NORMAL <20",
                position: "right",
                fill: "var(--color-term-green)",
                fontSize: 9,
              }}
            />
            <ReferenceLine
              y={30}
              stroke="var(--color-term-red)"
              strokeDasharray="4 4"
              label={{
                value: "FEAR >30",
                position: "right",
                fill: "var(--color-term-red)",
                fontSize: 9,
              }}
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

      {/* ── Consumer Sentiment Chart ───────────────────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <SectionLabel>UMich Consumer Sentiment (24M)</SectionLabel>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart
            data={sentChart}
            margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
          >
            <CartesianGrid
              stroke="var(--color-term-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
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
            <Tooltip
              content={<ChartTooltip formatter={(v) => formatNum(v, 1)} />}
            />
            <ReferenceLine
              y={65}
              stroke="var(--color-term-amber)"
              strokeDasharray="4 4"
              label={{
                value: "WEAK <65",
                position: "right",
                fill: "var(--color-term-amber)",
                fontSize: 9,
              }}
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

      {/* ── Risk Heat Map ─────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: "14px 16px" }}>
        <SectionLabel>Risk Heat Map</SectionLabel>
        <RiskHeatMap data={data} />
      </div>

      {/* ── Indicator Cards ───────────────────────────────────────────── */}
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
            detail="CBOE Volatility Index measures market expectations of near-term volatility. Above 20 signals elevated fear; above 30 signals panic or crisis conditions."
            source="CBOE / FRED VIXCLS"
          />
          <IndicatorCard
            label="Consumer Sentiment"
            value={sentVal}
            unit=""
            change={sentChange}
            decimals={1}
            detail="University of Michigan Consumer Sentiment Index. Readings below 65 indicate significant consumer pessimism which often precedes spending contractions."
            source="UMich / FRED UMCSENT"
          />
          <IndicatorCard
            label="Gold Price"
            value={goldVal}
            unit="$"
            change={goldChange}
            decimals={2}
            detail="Gold (USD/troy oz). Rising gold prices signal risk-off sentiment, dollar weakness, or inflation expectations. Strong safe-haven demand above $2000."
            source="ICE / FRED GOLDAMGBD228NLBM"
          />
          <IndicatorCard
            label="HY Credit Spread"
            value={hyVal}
            unit="%"
            change={hyChange}
            decimals={2}
            detail="ICE BofA High Yield OAS spread over Treasuries. Spreads above 4% signal credit stress; above 6% indicates distress or recessionary conditions."
            source="ICE BofA / FRED BAMLH0A0HYM2"
          />
          <IndicatorCard
            label="Recession Probability"
            value={recVal}
            unit="%"
            change={recChange}
            decimals={1}
            detail="Smoothed US Recession Probability from the NY Fed probit model. Above 20% is considered elevated; above 40% historically coincides with confirmed recessions."
            source="NY Fed / FRED RECPROUSM156N"
          />
          <IndicatorCard
            label="S&P 500"
            value={sp500Val}
            unit=""
            change={sp500Change}
            decimals={2}
            detail="S&P 500 composite index. Broad US equity benchmark. Sharp drawdowns in conjunction with rising VIX and credit spreads compound systemic risk signals."
            source="S&P / FRED SP500"
          />
        </div>
      </div>

    </div>
  );
}
