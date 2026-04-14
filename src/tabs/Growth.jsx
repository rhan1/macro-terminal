import { useFredData } from "../hooks/useFredData";
import { useIsmData } from "../hooks/useIsmData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";

const FETCH = {
  GDP:      SERIES.GDP,
  M2:       SERIES.M2,
  HOUSING:  SERIES.HOUSING,
  INDPRO:   SERIES.INDPRO,
  FEDFUNDS: SERIES.FEDFUNDS,
};

function toQuarterLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const year = String(d.getFullYear()).slice(2);
  const q = month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTHS[mi]} ${y}` : `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

function fmtCardQuarter(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const q = month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
}

function buildGdpChartData(raw) {
  if (!raw || raw.length === 0) return [];
  return [...raw].slice(0, 12).reverse().map((pt) => ({
    quarter: toQuarterLabel(pt.date),
    value: pt.value,
  }));
}

function buildIndproChartData(raw) {
  if (!raw || raw.length === 0) return [];
  return [...raw].slice(0, 24).reverse().map((pt) => ({
    date: pt.date.slice(0, 7),
    value: pt.value,
  }));
}

function gdpBarColor(v) {
  if (v < 2) return "hsl(0,72%,55%)";
  if (v < 3) return "hsl(45,90%,55%)";
  return "hsl(142,70%,55%)";
}

function gdpNarrative(gdpData) {
  const lat = latest(gdpData);
  const pr = prior(gdpData);
  if (!lat) return "Awaiting GDP data.";
  const v = lat.value;
  const trend =
    pr == null
      ? "unchanged"
      : v > pr.value
      ? "accelerating from " + formatNum(pr.value, 1) + "%"
      : v < pr.value
      ? "decelerating from " + formatNum(pr.value, 1) + "%"
      : "flat from prior quarter";

  if (v >= 3.0)
    return `Real GDP grew ${formatNum(v, 1)}% SAAR in ${toQuarterLabel(lat.date)}, ${trend} — above the ~2.3% post-2010 average. Growth is running above consensus expectations. Risk assets typically benefit; watch for Fed hawkishness if pace is sustained.`;
  if (v >= 2.0)
    return `Real GDP at ${formatNum(v, 1)}% SAAR (${toQuarterLabel(lat.date)}), ${trend} — near the post-2010 long-run average of ~2.3%. Trend growth; consistent with a soft-landing scenario. Sector rotation toward quality is prudent.`;
  if (v >= 0)
    return `Real GDP at ${formatNum(v, 1)}% SAAR (${toQuarterLabel(lat.date)}), ${trend} — below the post-2010 trend of ~2.3%. Sub-consensus growth raises recession risk watch. Defensive positioning and credit spread monitoring warranted.`;
  return `Real GDP contracted ${formatNum(v, 1)}% SAAR in ${toQuarterLabel(lat.date)}, ${trend}. Negative GDP readings historically coincide with earnings downgrades and equity drawdowns. NBER recession determination typically lags by months.`;
}

function ismNarrative(ismData) {
  if (!ismData?.manufacturing || !ismData?.services) return "Awaiting ISM survey data.";
  const mfg = ismData.manufacturing.value;
  const svc = ismData.services.value;
  const mfgLabel = mfg > 50 ? "expanding" : "contracting";
  const svcLabel = svc > 50 ? "expanding" : "contracting";
  const mfgStr = `Manufacturing PMI at ${mfg} (${mfgLabel})`;
  const svcStr = `Services PMI at ${svc} (${svcLabel})`;

  if (mfg > 50 && svc > 50)
    return `${mfgStr}; ${svcStr}. Both sectors are in expansion territory — a broad-based positive signal for activity. Sustained dual-PMI expansion historically coincides with above-trend GDP growth and favorable conditions for cyclical risk assets.`;
  if (mfg < 50 && svc > 50)
    return `${mfgStr}; ${svcStr}. The goods economy is in contraction while services hold up — a divergence common in late-cycle environments. Services account for ~70% of U.S. GDP, limiting overall recession risk, but watch for contagion from the manufacturing downturn.`;
  if (mfg > 50 && svc < 50)
    return `${mfgStr}; ${svcStr}. Manufacturing is expanding but services are contracting. Services weakness is the more consequential signal given its share of economic activity. Defensive positioning is warranted until services PMI stabilizes.`;
  return `${mfgStr}; ${svcStr}. Both sectors are below the 50 expansion threshold — a broad contraction signal. Dual-PMI sub-50 readings are historically associated with rising recession probability and have preceded NBER recession dates in multiple cycles.`;
}

function indproNarrative(indproData) {
  const lat = latest(indproData);
  const pr = prior(indproData);
  if (!lat) return "Awaiting industrial production data.";
  const v = lat.value;
  const dir = pr == null ? "unchanged" : v > pr.value ? "improving" : v < pr.value ? "softening" : "flat";

  if (v >= 2.0)
    return `Industrial production rose ${formatNum(v, 1)}% YoY — goods-economy activity is expanding, ${dir} from prior month. INDPRO is a core NBER coincident indicator; readings above 2% align with broad economic expansion.`;
  if (v >= 0)
    return `Industrial production up ${formatNum(v, 1)}% YoY (${dir}). Growth is positive but subdued — inventory-cycle dynamics and weak export demand may be capping output. Watch manufacturing ISM for confirmation.`;
  return `Industrial production fell ${formatNum(v, 1)}% YoY (${dir}) — contraction in goods output is a reliable recession-coincident signal. Alongside soft PMIs, persistent negative INDPRO readings historically precede NBER recession dates.`;
}

export default function Growth() {
  const { data, loading, error } = useFredData(FETCH);
  const { data: ismData } = useIsmData();

  if (loading) return <Loading />;
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "hsl(0,72%,55%)", fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  const {
    GDP:      gdpRaw      = [],
    M2:       m2Raw       = [],
    HOUSING:  housingRaw  = [],
    INDPRO:   indproRaw   = [],
    FEDFUNDS: fedfundsRaw = [],
  } = data;

  const gdpChartData    = buildGdpChartData(gdpRaw);
  const indproChartData = buildIndproChartData(indproRaw);

  const gdpLatest      = latest(gdpRaw);
  const gdpPrior       = prior(gdpRaw);
  const gdpChange      = change(gdpLatest?.value, gdpPrior?.value);

  const m2Latest       = latest(m2Raw);
  const m2Prior        = prior(m2Raw);
  const m2Change       = change(m2Latest?.value, m2Prior?.value);

  const housingLatest  = latest(housingRaw);
  const housingPrior   = prior(housingRaw);
  const housingChange  = change(housingLatest?.value, housingPrior?.value);

  const indproLatest   = latest(indproRaw);
  const indproPrior    = prior(indproRaw);
  const indproChange   = change(indproLatest?.value, indproPrior?.value);

  const fedfundsLatest = latest(fedfundsRaw);
  const fedfundsPrior  = prior(fedfundsRaw);
  const fedfundsChange = change(fedfundsLatest?.value, fedfundsPrior?.value);

  // Derive a GDP forecast value from the last two readings (simple trend extrapolation)
  const gdpPrior2 = prior(gdpRaw, 2);
  const gdpForecast =
    gdpLatest && gdpPrior
      ? parseFloat(
          (gdpLatest.value + (gdpLatest.value - (gdpPrior2?.value ?? gdpPrior.value))).toFixed(1)
        )
      : null;

  // Signals
  const gdpSignal =
    gdpLatest?.value < 0 ? "bearish" : gdpLatest?.value >= 2.5 ? "bullish" : "neutral";
  const indproSignal =
    indproLatest?.value < 0 ? "bearish" : indproLatest?.value >= 2 ? "bullish" : "neutral";
  const housingDirection =
    housingChange == null ? "flat" : housingChange > 0 ? "up" : housingChange < 0 ? "down" : "flat";
  const housingSignal =
    housingLatest?.value > 1400 ? "bullish" : housingLatest?.value < 1000 ? "bearish" : "neutral";

  const axisStyle = {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 9,
    fill: "hsl(220,10%,40%)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>

      {/* Section Header */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "hsl(142,70%,55%)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          $ GROWTH &amp; ACTIVITY
        </div>
        <div
          style={{
            fontSize: 10,
            color: "hsl(220,10%,40%)",
            marginTop: 2,
          }}
        >
          — GDP, ISM, Money Supply, Housing
        </div>
      </div>

      {/* Row 1: Two charts side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left: Real GDP Growth */}
        <div className="panel">
          <div className="section-label">Real GDP Growth (SAAR, %)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={gdpChartData}
              margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
              barCategoryGap="15%"
            >
              <CartesianGrid
                vertical={false}
                stroke="hsl(220,15%,14%)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="quarter"
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "hsl(220,15%,14%)" }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${formatNum(v, 2)}%`} />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <ReferenceLine
                y={2}
                stroke="hsl(220,10%,40%)"
                strokeDasharray="4 4"
              />
              <Bar dataKey="value" name="GDP Growth" radius={[2, 2, 0, 0]} maxBarSize={32}>
                {gdpChartData.map((entry, i) => (
                  <Cell key={i} fill={gdpBarColor(entry.value)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "hsl(220,10%,40%)",
              lineHeight: 1.65,
            }}
          >
            <span style={{ color: "hsl(142,70%,55%)" }}>▸ </span>
            {gdpNarrative(gdpRaw)}
          </div>
        </div>

        {/* Right: ISM PMI (fallback to Industrial Production) */}
        <div className="panel">
          {ismData?.manufacturing && ismData?.services ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="section-label">ISM PMI — Manufacturing vs Services</div>
                {ismData.manufacturing?.period && (
                  <span style={{ fontSize: 9, color: "var(--color-term-dim)", letterSpacing: "0.04em" }}>
                    Data: {ismData.manufacturing.period}
                  </span>
                )}
              </div>

              {/* 50 divider label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "12px 0 16px",
                }}
              >
                <div style={{ flex: 1, height: 1, background: "hsl(220,15%,20%)" }} />
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: "0.08em",
                    color: "hsl(220,10%,40%)",
                  }}
                >
                  50 = EXPANSION THRESHOLD
                </div>
                <div style={{ flex: 1, height: 1, background: "hsl(220,15%,20%)" }} />
              </div>

              {/* Two large PMI value displays */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                {/* Manufacturing */}
                {(() => {
                  const mfg = ismData.manufacturing;
                  const mfgColor =
                    mfg.value > 50 ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)";
                  const isUp = mfg.prior != null ? mfg.value > mfg.prior : null;
                  return (
                    <div
                      style={{
                        background: "hsl(220,15%,10%)",
                        border: `1px solid ${mfgColor}33`,
                        borderRadius: 6,
                        padding: "16px 12px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontFamily: '"JetBrains Mono", monospace',
                          letterSpacing: "0.12em",
                          color: "hsl(185,70%,55%)",
                          marginBottom: 8,
                        }}
                      >
                        MFG PMI
                      </div>
                      <div
                        style={{
                          fontSize: 42,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 700,
                          color: mfgColor,
                          lineHeight: 1,
                          marginBottom: 4,
                        }}
                      >
                        {formatNum(mfg.value, 1)}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: '"JetBrains Mono", monospace',
                          color: "hsl(220,10%,40%)",
                          marginTop: 8,
                        }}
                      >
                        {mfg.period && (
                          <span style={{ marginRight: 6 }}>{mfg.period}</span>
                        )}
                        {mfg.prior != null && (
                          <span>
                            prior{" "}
                            <span style={{ color: "hsl(220,10%,55%)" }}>
                              {formatNum(mfg.prior, 1)}
                            </span>
                            {isUp !== null && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  color: isUp ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)",
                                }}
                              >
                                {isUp ? "▲" : "▼"}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Services */}
                {(() => {
                  const svc = ismData.services;
                  const svcColor =
                    svc.value > 50 ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)";
                  const isUp = svc.prior != null ? svc.value > svc.prior : null;
                  return (
                    <div
                      style={{
                        background: "hsl(220,15%,10%)",
                        border: `1px solid ${svcColor}33`,
                        borderRadius: 6,
                        padding: "16px 12px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontFamily: '"JetBrains Mono", monospace',
                          letterSpacing: "0.12em",
                          color: "hsl(142,70%,55%)",
                          marginBottom: 8,
                        }}
                      >
                        SVC PMI
                      </div>
                      <div
                        style={{
                          fontSize: 42,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 700,
                          color: svcColor,
                          lineHeight: 1,
                          marginBottom: 4,
                        }}
                      >
                        {formatNum(svc.value, 1)}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: '"JetBrains Mono", monospace',
                          color: "hsl(220,10%,40%)",
                          marginTop: 8,
                        }}
                      >
                        {svc.period && (
                          <span style={{ marginRight: 6 }}>{svc.period}</span>
                        )}
                        {svc.prior != null && (
                          <span>
                            prior{" "}
                            <span style={{ color: "hsl(220,10%,55%)" }}>
                              {formatNum(svc.prior, 1)}
                            </span>
                            {isUp !== null && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  color: isUp ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)",
                                }}
                              >
                                {isUp ? "▲" : "▼"}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "hsl(220,10%,40%)",
                  lineHeight: 1.65,
                }}
              >
                <span style={{ color: "hsl(142,70%,55%)" }}>▸ </span>
                {ismNarrative(ismData)}
              </div>
            </>
          ) : (
            <>
              <div className="section-label">Industrial Production — YoY % Change</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={indproChartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="hsl(220,15%,14%)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="date"
                    tick={axisStyle}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(220,15%,14%)" }}
                    interval={3}
                  />
                  <YAxis
                    tick={axisStyle}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v) => `${formatNum(v, 2)}%`} />}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="hsl(220,10%,40%)"
                    strokeDasharray="4 4"
                  />
                  <Bar
                    dataKey="value"
                    name="Ind. Production"
                    fill="hsl(185,70%,55%)"
                    fillOpacity={0.75}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "hsl(220,10%,40%)",
                  lineHeight: 1.65,
                }}
              >
                <span style={{ color: "hsl(142,70%,55%)" }}>▸ </span>
                {indproNarrative(indproRaw)}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Row 2: 6 Indicator Cards in 3-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

        <IndicatorCard
          label="Real GDP"
          value={gdpLatest?.value}
          unit="%"
          change={gdpChange}
          changeLabel={gdpChange != null ? formatPct(gdpChange) : undefined}
          direction={gdpChange == null ? "flat" : gdpChange > 0 ? "up" : "down"}
          signal={gdpSignal}
          detail={`Annualized real GDP growth rate for ${gdpLatest ? toQuarterLabel(gdpLatest.date) : "the most recent quarter"} — the broadest measure of U.S. economic output. The post-2010 average is ~2.3% annualized. Sustained readings above 3% historically coincide with tightening Fed policy and rising long-end yields. Sub-2% growth often presages earnings downgrades and sector rotation toward defensives.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/A191RL1Q225SBEA"
          decimals={1}
          dateLabel={fmtCardQuarter(latest(gdpRaw)?.date)}
        />

        <IndicatorCard
          label="Industrial Production"
          value={indproLatest?.value}
          unit="% YoY"
          change={indproChange}
          changeLabel={indproChange != null ? formatPct(indproChange) : undefined}
          direction={indproChange == null ? "flat" : indproChange > 0 ? "up" : "down"}
          signal={indproSignal}
          detail={`Year-over-year change in industrial output across manufacturing, mining, and electric/gas utilities. INDPRO is a real-time proxy for goods-economy activity and is one of the four coincident indicators used by the NBER to date recessions. Persistent negative readings (especially alongside soft PMIs) are a reliable recession signal. The goods sector has faced inventory-cycle headwinds post-pandemic.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/INDPRO"
          decimals={2}
          dateLabel={fmtCardDate(latest(indproRaw)?.date)}
        />

        <IndicatorCard
          label="M2 Money Supply"
          value={m2Latest?.value}
          unit="% YoY"
          change={m2Change}
          changeLabel={m2Change != null ? formatPct(m2Change) : undefined}
          direction={m2Change == null ? "flat" : m2Change > 0 ? "up" : "down"}
          signal="neutral"
          detail={`Year-over-year change in M2 money supply, a broad monetary aggregate covering cash, checking, savings, and money market balances. Milton Friedman's rule of thumb linked M2 growth to nominal GDP growth with a ~12–18 month lag. Rapid M2 expansion preceded the 2021–2022 inflation spike; current trajectory matters for the medium-term inflation outlook.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/M2SL"
          decimals={2}
          dateLabel={fmtCardDate(latest(m2Raw)?.date)}
        />

        <IndicatorCard
          label="Housing Starts"
          value={housingLatest?.value}
          unit="K units"
          change={housingChange}
          changeLabel={housingChange != null ? formatPct(housingChange) : undefined}
          direction={housingDirection}
          signal={housingSignal}
          detail={`New residential construction starts in thousands of units. Housing is a classic leading indicator — it responds to mortgage rates and consumer confidence before broader economic shifts appear in GDP. Starts above 1,400K signal a healthy construction sector; below 1,000K often coincides with or precedes recessionary conditions. Current mortgage-rate headwinds are a key variable to watch.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/HOUST"
          decimals={0}
          dateLabel={fmtCardDate(latest(housingRaw)?.date)}
        />

        <IndicatorCard
          label="ISM Manufacturing"
          value={ismData?.manufacturing?.value}
          unit=""
          change={
            ismData?.manufacturing?.value != null && ismData?.manufacturing?.prior != null
              ? ismData.manufacturing.value - ismData.manufacturing.prior
              : null
          }
          changeLabel={
            ismData?.manufacturing?.value != null && ismData?.manufacturing?.prior != null
              ? `${ismData.manufacturing.value >= ismData.manufacturing.prior ? "+" : ""}${formatNum(ismData.manufacturing.value - ismData.manufacturing.prior, 1)}pts`
              : undefined
          }
          direction={
            ismData?.manufacturing?.value != null && ismData?.manufacturing?.prior != null
              ? ismData.manufacturing.value > ismData.manufacturing.prior
                ? "up"
                : ismData.manufacturing.value < ismData.manufacturing.prior
                ? "down"
                : "flat"
              : "flat"
          }
          signal={
            ismData?.manufacturing?.value != null
              ? ismData.manufacturing.value > 50
                ? "bullish"
                : "bearish"
              : "neutral"
          }
          detail="ISM Manufacturing PMI. Readings above 50 indicate expansion in the factory sector. The ISM survey is one of the most watched leading indicators for economic activity."
          source="ISM / Trading Economics"
          decimals={1}
        />

        <IndicatorCard
          label="Fed Funds Rate"
          value={fedfundsLatest?.value}
          unit="%"
          change={fedfundsChange}
          changeLabel={fedfundsChange != null ? formatPct(fedfundsChange) : undefined}
          direction={fedfundsChange == null ? "flat" : fedfundsChange > 0 ? "up" : fedfundsChange < 0 ? "down" : "flat"}
          signal="neutral"
          detail={`Effective Federal Funds Rate — the overnight interbank lending rate targeted by the Federal Open Market Committee. The FFR is the primary policy lever: higher rates tighten financial conditions, cool inflation, and reduce GDP growth. Rate changes transmit through the economy with lags of 12–18 months. Markets price future rate paths via Fed Funds futures, which drive long-end Treasury yields and equity valuations.`}
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/DFF"
          decimals={2}
          dateLabel={fmtCardDate(latest(fedfundsRaw)?.date)}
        />

      </div>

    </div>
  );
}
