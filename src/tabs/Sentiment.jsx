import { useState, useEffect } from "react";
import { useSentimentData } from "../hooks/useSentimentData";
import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import Loading from "../components/Loading";
import ChartTooltip from "../components/ChartTooltip";
import AsOfPill from "../components/AsOfPill";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE = "hsl(220,20%,7%)";

const SECTOR_ETFS = ["XLK","XLF","XLE","XLV","XLI","XLC","XLP","XLB","XLRE","XLU","XLY"];
const SECTOR_NAMES = {
  XLK: "Tech", XLF: "Financials", XLE: "Energy", XLV: "Health Care",
  XLI: "Industrials", XLC: "Comms", XLP: "Staples", XLB: "Materials",
  XLRE: "Real Estate", XLU: "Utilities", XLY: "Discretionary",
};

function fgColor(score) {
  if (score >= 75) return RED;
  if (score >= 55) return GREEN;
  if (score >= 45) return AMBER;
  if (score >= 25) return AMBER;
  return RED;
}

function fgLabel(score) {
  if (score >= 75) return "EXTREME GREED";
  if (score >= 55) return "GREED";
  if (score >= 45) return "NEUTRAL";
  if (score >= 25) return "FEAR";
  return "EXTREME FEAR";
}

const SECTOR_CLAMP = 3;
const SECTOR_FILL = "hsl(220,20%,9%)";
const SECTOR_NAME_COLOR = "hsl(220,15%,82%)";
const SECTOR_PRICE_COLOR = "hsl(220,12%,58%)";

function sectorBarHeight(pct) {
  const clamped = Math.min(Math.abs(pct), SECTOR_CLAMP);
  return clamped / SECTOR_CLAMP;
}

function sectorBarColor(pct) {
  if (Math.abs(pct) < 0.05) return "hsl(220,10%,45%)";
  const hue = pct >= 0 ? 142 : 0;
  const sat = pct >= 0 ? 70 : 72;
  const mag = Math.min(Math.abs(pct), SECTOR_CLAMP);
  const lightness = 45 + (mag / SECTOR_CLAMP) * 15;
  return `hsl(${hue},${sat}%,${lightness}%)`;
}

function sectorPctColor(pct) {
  if (Math.abs(pct) < 0.05) return "hsl(220,10%,75%)";
  return pct >= 0 ? "hsl(142,70%,62%)" : "hsl(0,72%,62%)";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTHS[mi]} ${y}` : `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

function formatMentionPct(pct) {
  if (pct == null || !isFinite(pct) || Math.abs(pct) > 1000) return "N/A";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function latestDateFromItems(items, keys = ["date"]) {
  if (!Array.isArray(items)) return null;
  const dates = items
    .flatMap((item) => keys.map((key) => item?.[key]).filter(Boolean))
    .filter((value) => !Number.isNaN(new Date(value).getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((latestDate, candidate) => (
    new Date(candidate).getTime() > new Date(latestDate).getTime() ? candidate : latestDate
  ));
}

export default function Sentiment() {
  const { data: sentData, loading: sentLoading } = useSentimentData();
  const { data: fredData, loading: fredLoading } = useFredData({
    NFCI: SERIES.NFCI,
    STLFSI: SERIES.STLFSI,
  });

  const [sectorData, setSectorData] = useState(null);
  const [redditData, setRedditData] = useState(null);
  const [redditPrices, setRedditPrices] = useState({});
  const [insiderData, setInsiderData] = useState(null);
  const [liquidityData, setLiquidityData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [adanosData, setAdanosData] = useState(null);
  const [kalshiData, setKalshiData] = useState(null);

  useEffect(() => {
    fetch(`/api/market?symbols=${SECTOR_ETFS.join(",")}`)
      .then((r) => r.json())
      .then(setSectorData)
      .catch(() => {});
    fetch("/api/reddit")
      .then((r) => r.json())
      .then((d) => {
        if (d.results) {
          const top = d.results.slice(0, 15);
          setRedditData(top);
          const syms = top.map((t) => t.ticker).join(",");
          fetch(`/api/market?symbols=${syms}`)
            .then((r) => r.json())
            .then(setRedditPrices)
            .catch(() => {});
          // Try Adanos for sentiment scores (max 10 tickers)
          const adSyms = top.slice(0, 10).map((t) => t.ticker).join(",");
          fetch(`/api/adanos?endpoint=compare&tickers=${adSyms}`)
            .then((r) => r.json())
            .then((d) => { if (!d.error && d.stocks) setAdanosData(d.stocks); else if (Array.isArray(d)) setAdanosData(d); })
            .catch(() => {});
        }
      })
      .catch(() => {});
    // FearGreedChart extras
    fetch("/api/sentiment?action=insider").then((r) => r.json()).then(setInsiderData).catch(() => {});
    fetch("/api/sentiment?action=liquidity").then((r) => r.json()).then(setLiquidityData).catch(() => {});
    fetch("/api/sentiment?action=regime").then((r) => r.json()).then(setRegimeData).catch(() => {});
    fetch("/api/sentiment?action=news").then((r) => r.json()).then(setNewsData).catch(() => {});
    fetch("/api/kalshi").then((r) => r.json()).then((d) => { if (d.markets) setKalshiData(d.markets); }).catch(() => {});
  }, []);

  if (sentLoading && !sentData && fredLoading && Object.keys(fredData).length === 0) return <Loading />;

  const score = sentData?.score?.score ?? sentData?.score ?? null;
  const components = sentData?.score?.components || sentData?.components || null;
  const history = sentData?.recent || sentData?.history || [];
  const fearGreedDate = latestDateFromItems(history, ["date", "publishedAt"]);

  // NFCI chart
  const nfciArr = fredData.NFCI || [];
  const nfciChart = [...nfciArr].slice(0, 30).reverse().map((pt) => ({
    date: pt.date,
    value: pt.value,
  }));

  const nfciLatest = latest(nfciArr);
  const nfciPrior = prior(nfciArr);
  const nfciChange = change(nfciLatest?.value, nfciPrior?.value);

  const stlfsiLatest = latest(fredData.STLFSI || []);
  const stlfsiPrior = prior(fredData.STLFSI || []);
  const stlfsiChange = change(stlfsiLatest?.value, stlfsiPrior?.value);

  // History chart (last 60 days)
  const historyChart = history.length > 0
    ? [...history].slice(-60).map((h) => ({ date: h.date, score: h.score }))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          $ SENTIMENT &amp; FLOWS
        </div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
          — Fear &amp; Greed, Sector Rotation, Financial Conditions
        </div>
      </div>

      {/* Row 1: F&G Gauge + Components */}
      <div className="grid-2">

        {/* Left: Fear & Greed Gauge */}
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Fear &amp; Greed Index</div>
            {fearGreedDate && <AsOfPill date={fearGreedDate} />}
          </div>
          {score != null ? (
            <>
              <div style={{
                fontSize: 72, fontWeight: 700, color: fgColor(score),
                lineHeight: 1, marginTop: 12, fontFamily: '"JetBrains Mono", monospace',
              }}>
                {Math.round(score)}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: fgColor(score),
                letterSpacing: "0.12em", marginTop: 8,
              }}>
                {fgLabel(score)}
              </div>
              <div style={{ fontSize: 9, color: DIM, marginTop: 12 }}>
                Scale: 0 (Extreme Fear) → 100 (Extreme Greed)
              </div>
              {/* Score bar */}
              <div style={{ margin: "12px auto 0", width: "80%", height: 6, background: BORDER, borderRadius: 3, position: "relative" }}>
                <div style={{
                  position: "absolute", left: `${score}%`, top: -3, width: 12, height: 12,
                  borderRadius: "50%", background: fgColor(score), transform: "translateX(-50%)",
                  border: `2px solid ${SURFACE}`,
                }} />
                <div style={{
                  height: "100%", borderRadius: 3, width: `${score}%`,
                  background: `linear-gradient(to right, ${RED}, ${AMBER}, ${GREEN})`,
                  opacity: 0.5,
                }} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: DIM, marginTop: 20 }}>Loading sentiment data...</div>
          )}
        </div>

        {/* Right: 5 Components */}
        <div className="panel">
          <div className="section-label">Component Breakdown</div>
          {components && Array.isArray(components) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {components.map((comp, i) => {
                const name = comp.name || `Component ${i}`;
                const val = comp.val ?? comp.value ?? comp.score ?? 0;
                const weight = comp.wt ?? comp.weight ?? null;
                const pct = typeof val === "number" ? val : parseFloat(val) || 0;
                const color = pct >= 55 ? GREEN : pct >= 45 ? AMBER : RED;
                return (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: DIM, textTransform: "capitalize" }}>
                        {name.toLowerCase()} {weight ? `(${weight}%)` : ""}
                      </span>
                      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{Math.round(pct)}</span>
                    </div>
                    <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                      <div style={{
                        height: "100%", borderRadius: 2, width: `${Math.min(100, pct)}%`,
                        background: color, transition: "width 0.3s ease",
                      }} />
                    </div>
                    {comp.desc && (
                      <div style={{ fontSize: 8, color: "hsl(220,10%,40%)", marginTop: 2 }}>{comp.desc}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: DIM }}>Loading components...</div>
          )}
        </div>
      </div>

      {/* Row 2: Sector Heatmap */}
      <div className="panel">
        <div className="section-label">Sector Performance — S&amp;P 500 SPDR ETFs</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
          gap: 4,
        }}>
          {SECTOR_ETFS.map((sym) => {
            const d = sectorData?.[sym];
            const pct = d?.changePct ?? 0;
            const barH = sectorBarHeight(pct);
            const barColor = sectorBarColor(pct);
            return (
              <div key={sym} style={{
                position: "relative",
                background: SECTOR_FILL,
                padding: "10px 8px 10px 14px",
                textAlign: "center",
                border: `1px solid ${BORDER}`,
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: 4,
                  height: `${barH * 100}%`,
                  background: barColor,
                  boxShadow: `0 0 6px ${barColor}`,
                  transition: "height 300ms ease, background 300ms ease",
                }} />
                <div style={{ fontSize: 9, color: SECTOR_NAME_COLOR, letterSpacing: "0.06em", marginBottom: 2 }}>
                  {SECTOR_NAMES[sym] || sym}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: sectorPctColor(pct), fontFamily: '"JetBrains Mono", monospace' }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </div>
                <div style={{ fontSize: 9, color: SECTOR_PRICE_COLOR }}>
                  ${d?.price?.toFixed(2) ?? "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 3: Reddit Buzz */}
      {redditData && redditData.length > 0 && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Reddit Buzz — Top Mentioned Tickers (24h)</div>
            <span style={{ fontSize: 9, color: DIM }}>r/wallstreetbets &middot; r/stocks &middot; r/investing</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 4 }}>
            {redditData.map((item) => {
              const rankDelta = item.rank_24h_ago ? item.rank_24h_ago - item.rank : 0;
              const mentionDelta = item.mentions_24h_ago ? item.mentions - item.mentions_24h_ago : 0;
              const mentionPct = item.mentions_24h_ago && item.mentions_24h_ago > 0
                ? (mentionDelta / item.mentions_24h_ago) * 100
                : null;
              const priceData = redditPrices[item.ticker];
              const price = priceData?.price;
              const pricePct = priceData?.changePct;
              // Adanos sentiment (if available)
              const adTicker = Array.isArray(adanosData) ? adanosData.find((a) => a.ticker === item.ticker) : null;
              const bullPct = adTicker?.bullish_pct;
              const bearPct = adTicker?.bearish_pct;
              return (
                <div key={item.ticker} style={{
                  padding: "8px 10px",
                  background: "hsl(220,15%,10%)",
                  border: `1px solid ${BORDER}`,
                  display: "flex", flexDirection: "column", gap: 2,
                  minHeight: 90,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: GREEN, fontFamily: '"JetBrains Mono", monospace' }}>
                      {item.ticker}
                    </span>
                    {price != null && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: pricePct >= 0 ? GREEN : RED, fontFamily: '"JetBrains Mono", monospace' }}>
                        ${price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>
                      {item.name}
                    </span>
                    {pricePct != null && (
                      <span style={{ fontSize: 9, color: pricePct >= 0 ? GREEN : RED }}>
                        {pricePct >= 0 ? "+" : ""}{pricePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: CYAN }}>{item.mentions} mentions</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {mentionPct != null && (
                        <span style={{ fontSize: 9, color: mentionDelta >= 0 ? GREEN : RED }}>
                          {formatMentionPct(mentionPct)}
                        </span>
                      )}
                      {rankDelta !== 0 && (
                        <span style={{ fontSize: 8, color: rankDelta > 0 ? GREEN : RED }}>
                          {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 3 }}>
                    <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden" }}>
                      {bullPct != null && bearPct != null ? (
                        <>
                          <div style={{ width: `${bullPct}%`, background: GREEN }} />
                          <div style={{ width: `${100 - bullPct - bearPct}%`, background: BORDER }} />
                          <div style={{ width: `${bearPct}%`, background: RED }} />
                        </>
                      ) : (
                        <div style={{ width: "100%", background: BORDER }} />
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 1 }}>
                      <span style={{ fontSize: 7, color: bullPct != null ? GREEN : DIM }}>{bullPct != null ? `${bullPct}% bull` : "—"}</span>
                      <span style={{ fontSize: 7, color: bearPct != null ? RED : DIM }}>{bearPct != null ? `${bearPct}% bear` : "—"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Row 4: F&G History + NFCI Chart */}
      <div className="grid-2">

        {/* Left: F&G History */}
        <div className="panel">
          <div className="section-label">Fear &amp; Greed — 60 Day Trend</div>
          {historyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={historyChart} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AMBER} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={AMBER} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 8, fill: DIM }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: DIM }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${Math.round(v)}`} />} />
                <ReferenceLine y={50} stroke={DIM} strokeDasharray="4 3" strokeWidth={1} />
                <ReferenceLine y={25} stroke={RED} strokeDasharray="2 4" strokeWidth={0.5} />
                <ReferenceLine y={75} stroke={GREEN} strokeDasharray="2 4" strokeWidth={0.5} />
                <Area type="monotone" dataKey="score" stroke={AMBER} strokeWidth={1.5} fill="url(#fgGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontSize: 11 }}>
              Loading history...
            </div>
          )}
        </div>

        {/* Right: NFCI Chart */}
        <div className="panel">
          <div className="section-label">National Financial Conditions Index (NFCI)</div>
          {nfciChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={nfciChart} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="nfciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 8, fill: DIM }} tickLine={false} axisLine={false} interval="preserveStartEnd"
                  tickFormatter={(d) => d ? `${d.slice(5, 7)}/${d.slice(8)}` : ""} />
                <YAxis tick={{ fontSize: 8, fill: DIM }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => v?.toFixed(3)} />} />
                <ReferenceLine y={0} stroke={DIM} strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="value" name="NFCI" stroke={CYAN} strokeWidth={1.5} fill="url(#nfciGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontSize: 11 }}>
              Loading NFCI...
            </div>
          )}
          <div style={{ fontSize: 9, color: DIM, marginTop: 6 }}>
            Positive = tighter than average &middot; Negative = looser than average
          </div>
        </div>
      </div>

      {/* Row 5: Market Regime + Insider Trading */}
      <div className="grid-2">
        {/* Market Regime */}
        <div className="panel">
          <div className="section-label">Market Regime</div>
          {regimeData?.regime ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  fontSize: 14, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace',
                  color: regimeData.regime.severity === "bullish" ? GREEN : regimeData.regime.severity === "bearish" ? RED : AMBER,
                }}>
                  {regimeData.regime.name?.toUpperCase() || "—"}
                </span>
              </div>
              {(regimeData.regime.description || regimeData.regime.desc) && (
                <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6, marginBottom: 8 }}>{regimeData.regime.description || regimeData.regime.desc}</div>
              )}
              {regimeData.regime.action && (
                <div style={{ fontSize: 10, color: CYAN, lineHeight: 1.6 }}>
                  <span style={{ color: GREEN }}>▸ </span>{regimeData.regime.action}
                </div>
              )}
              {regimeData.current && (
                <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  {regimeData.current.vix_level && (
                    <span style={{ fontSize: 9, color: DIM }}>VIX: <span style={{ color: regimeData.current.vix_level === "calm" ? GREEN : RED }}>{regimeData.current.vix_level}</span></span>
                  )}
                  {regimeData.current.vel_dir && (
                    <span style={{ fontSize: 9, color: DIM }}>Momentum: <span style={{ color: regimeData.current.vel_dir === "rising" ? GREEN : RED }}>{regimeData.current.vel_dir}</span></span>
                  )}
                  {regimeData.current.liq_label && (
                    <span style={{ fontSize: 9, color: DIM }}>Liquidity: <span style={{ color: regimeData.current.liq_label === "Expanding" ? GREEN : RED }}>{regimeData.current.liq_label}</span></span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: DIM }}>Loading regime...</div>
          )}
        </div>

        {/* Insider Trading */}
        <div className="panel">
          <div className="section-label">Insider Trading — SEC Form 4</div>
          {insiderData?.score?.score != null ? (() => {
            const iScore = insiderData.score.score;
            const iLabel = insiderData.score.label;
            const iStats = insiderData.score.stats;
            const iColor = iScore > 50 ? GREEN : iScore < 30 ? RED : AMBER;
            return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', color: iColor }}>
                  {iScore}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: iColor }}>
                  {iLabel || ""}
                </span>
              </div>
              {iStats && (
                <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: GREEN }}>Buys: {iStats.total_buys ?? "—"}</div>
                  <div style={{ fontSize: 10, color: RED }}>Sells: {iStats.total_sells ?? "—"}</div>
                  {iStats.csuite_buys != null && (
                    <div style={{ fontSize: 10, color: CYAN }}>C-Suite Buys: {iStats.csuite_buys}</div>
                  )}
                </div>
              )}
              {insiderData.top_buys && insiderData.top_buys.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.06em", marginBottom: 4 }}>NOTABLE BUYS</div>
                  {insiderData.top_buys.slice(0, 4).map((b, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "2px 0", borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ color: GREEN }}>{b.symbol}</span>
                      <span style={{ color: DIM }}>{b.name?.split(",")[0]?.slice(0, 20)}</span>
                      <span style={{ color: GREEN }}>${(b.value / 1e6).toFixed(1)}M</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })() : (
            <div style={{ fontSize: 11, color: DIM }}>Loading insider data...</div>
          )}
        </div>
      </div>

      {/* Row 5.5: Prediction Markets */}
      {kalshiData && (
        <div className="panel">
          <div className="section-label">Prediction Markets — Kalshi</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {kalshiData.map((market, i) => {
              const prob = market.probability ?? market.yes_price ?? market.price ?? 0;
              const probPct = Math.round(prob * (prob <= 1 ? 100 : 1));
              const probColor = probPct >= 60 ? GREEN : probPct >= 40 ? AMBER : RED;
              const vol = market.volume ?? market.dollar_volume ?? null;
              let volLabel = null;
              if (vol != null) {
                if (vol >= 1e6) volLabel = `$${(vol / 1e6).toFixed(1)}M`;
                else if (vol >= 1e3) volLabel = `$${(vol / 1e3).toFixed(0)}K`;
                else volLabel = `$${vol}`;
              }
              // Prefer market_title (the specific yes/no question) over title
              // (the short category label) so probabilities read unambiguously.
              const title = market.market_title ?? market.title ?? market.name ?? market.question ?? "—";
              const subtitle = market.subtitle ?? market.category ?? null;
              return (
                <div key={market.id ?? i} style={{
                  background: "hsl(220,15%,10%)",
                  border: `1px solid ${BORDER}`,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}>
                  <div style={{
                    fontSize: 10, color: DIM, lineHeight: 1.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 700, color: probColor,
                    fontFamily: '"JetBrains Mono", monospace', lineHeight: 1,
                    marginTop: 4,
                  }}>
                    {probPct}%
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    {subtitle && (
                      <span style={{ fontSize: 8, color: "hsl(220,10%,40%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                        {subtitle}
                      </span>
                    )}
                    {volLabel && (
                      <span style={{
                        fontSize: 8, color: CYAN,
                        background: "hsl(185,70%,55%,0.1)",
                        border: `1px solid hsl(185,70%,30%)`,
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontFamily: '"JetBrains Mono", monospace',
                        marginLeft: "auto",
                      }}>
                        {volLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {kalshiData === null && (
        <div className="panel">
          <div className="section-label">Prediction Markets — Kalshi</div>
          <div style={{ fontSize: 11, color: DIM }}>Loading prediction markets...</div>
        </div>
      )}

      {/* Row 6: Liquidity + News */}
      <div className="grid-2">
        {/* Fed Liquidity */}
        <div className="panel">
          <div className="section-label">Fed Liquidity Index</div>
          {liquidityData?.net_liquidity != null ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', color: CYAN }}>
                  ${liquidityData.net_liquidity.toFixed(2)}T
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: liquidityData.trend_label === "Expanding" ? GREEN : RED,
                }}>
                  {liquidityData.trend_label || ""}
                </span>
              </div>
              {liquidityData.components && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {liquidityData.components.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: DIM }}>
                      <span>{c.name}</span>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {c.value != null ? `${c.unit === "T" || c.value > 1 ? "$" : ""}${c.value.toFixed(c.value > 100 ? 0 : 3)}${c.unit || "T"}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: DIM }}>Loading liquidity...</div>
          )}
        </div>

        {/* Market News */}
        <div className="panel">
          <div className="section-label">Market Headlines</div>
          {Array.isArray(newsData) && newsData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {newsData.slice(0, 6).map((article, i) => (
                <a
                  key={i}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block", fontSize: 10, color: DIM, textDecoration: "none",
                    padding: "4px 0", borderBottom: `1px solid ${BORDER}`, lineHeight: 1.5,
                  }}
                  onMouseEnter={(e) => { e.target.style.color = CYAN; }}
                  onMouseLeave={(e) => { e.target.style.color = DIM; }}
                >
                  <span style={{ color: GREEN, marginRight: 4 }}>▸</span>
                  {article.title}
                  <span style={{ fontSize: 8, color: "hsl(220,10%,38%)", marginLeft: 6 }}>{article.publisher}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: DIM }}>Loading news...</div>
          )}
        </div>
      </div>

      {/* Row 7: Indicator Cards */}
      <div className="grid-2">
        <IndicatorCard
          label="NFCI"
          value={nfciLatest?.value}
          unit=""
          decimals={3}
          change={nfciChange}
          changeLabel={nfciChange != null ? formatPct(nfciChange) : undefined}
          direction={nfciChange == null ? "flat" : nfciChange > 0 ? "up" : "down"}
          signal={nfciLatest?.value == null ? "neutral" : nfciLatest.value > 0 ? "bearish" : "bullish"}
          detail="Chicago Fed National Financial Conditions Index. Positive = tighter than average, negative = looser. Covers risk, credit, and leverage subindices across money, debt, and equity markets. A weekly leading indicator of financial stress."
          source="Chicago Fed / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/NFCI"
          dateLabel={fmtCardDate(nfciLatest?.date)}
          sparkData={nfciArr?.slice(0, 12)}
        />
        <IndicatorCard
          label="Financial Stress"
          value={stlfsiLatest?.value}
          unit=""
          decimals={3}
          change={stlfsiChange}
          changeLabel={stlfsiChange != null ? formatPct(stlfsiChange) : undefined}
          direction={stlfsiChange == null ? "flat" : stlfsiChange > 0 ? "up" : "down"}
          signal={stlfsiLatest?.value == null ? "neutral" : stlfsiLatest.value > 1 ? "bearish" : stlfsiLatest.value < 0 ? "bullish" : "neutral"}
          detail="Chicago Fed Adjusted National Financial Conditions Index (ANFCI) — isolates the component of financial conditions uncorrelated with economic activity. Zero = average conditions; positive = tighter than normal; negative = looser."
          source="Chicago Fed / FRED"
          sourceUrl="https://fred.stlouisfed.org/series/ANFCI"
          dateLabel={fmtCardDate(stlfsiLatest?.date)}
          sparkData={(fredData.STLFSI || [])?.slice(0, 12)}
        />
      </div>
    </div>
  );
}
