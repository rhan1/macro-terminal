import { useState, useEffect } from "react";
import Loading from "../components/Loading";
import ChartTooltip from "../components/ChartTooltip";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// ── Styling constants ─────────────────────────────────────────────────────────
const GREEN  = "hsl(142,70%,55%)";
const RED    = "hsl(0,72%,55%)";
const AMBER  = "hsl(45,90%,55%)";
const CYAN   = "hsl(185,70%,55%)";
const DIM    = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

// ── Date formatters for XAxis ──────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtTickShort(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtTickYear(dateStr) {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

function getTickFormatter(range) {
  return ["1M", "3M", "6M"].includes(range) ? fmtTickShort : fmtTickYear;
}

// ── Range → API param map ─────────────────────────────────────────────────────
const RANGE_PARAMS = {
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
  "5Y": "5y",
};

// ── Range selector button ──────────────────────────────────────────────────────
function RangeButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "hsla(142,70%,55%,0.15)" : "none",
        border: active ? "1px solid hsla(142,70%,55%,0.4)" : "1px solid transparent",
        color: active ? GREEN : DIM,
        fontSize: 9,
        fontFamily: "inherit",
        padding: "2px 8px",
        cursor: "pointer",
        letterSpacing: "0.04em",
        fontWeight: active ? 600 : 400,
        transition: "all 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        color: DIM,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderBottom: `1px solid ${BORDER}`,
        paddingBottom: 6,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// ── Category label ────────────────────────────────────────────────────────────
function CategoryLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        color: AMBER,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

// ── RICK anchor chart panel ────────────────────────────────────────────────────
function RickChartPanel({ stock, range }) {
  const tickFormatter = getTickFormatter(range);
  const price     = stock?.price;
  const change    = stock?.change;
  const changePct = stock?.changePct;
  const high52    = stock?.high52w;
  const low52     = stock?.low52w;
  const ticker    = "RICK";
  const name      = stock?.name ?? ticker;

  const chartData = (stock?.chart ?? []).map((p) => ({
    date: typeof p.date === "string" ? p.date : String(p.date),
    value: p.close,
  }));

  const priceColor  = changePct == null ? GREEN : changePct >= 0 ? GREEN : RED;
  const changeColor = changePct == null ? DIM   : changePct >= 0 ? GREEN : RED;
  const changeStr   = changePct == null
    ? "—"
    : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
  const changeAbsStr = change == null
    ? ""
    : `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            {ticker}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-term-text)", marginTop: 2, fontWeight: 500 }}>
            {name}
          </div>
        </div>
        {high52 != null && low52 != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              52W Range
            </div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              ${low52.toFixed(2)} — ${high52.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Price + change */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: priceColor,
            fontVariantNumeric: "tabular-nums",
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </span>
        <span style={{ fontSize: 11, color: changeColor, fontVariantNumeric: "tabular-nums" }}>
          {changeAbsStr && <span>{changeAbsStr} </span>}
          {changeStr}
        </span>
      </div>

      {/* Area chart */}
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="viceGrad-RICK" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={GREEN} stopOpacity={0.15} />
              <stop offset="95%" stopColor={GREEN} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 8, fill: DIM, fontFamily: "inherit" }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
            interval={Math.max(1, Math.floor(chartData.length / 5))}
            tickFormatter={tickFormatter}
          />
          <YAxis
            tick={{ fontSize: 8, fill: DIM, fontFamily: "inherit" }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(v) =>
                  `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name="RICK"
            stroke={GREEN}
            strokeWidth={1.5}
            fill="url(#viceGrad-RICK)"
            dot={false}
            activeDot={{ r: 3, fill: GREEN }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Compact stock price card (no chart) ───────────────────────────────────────
function CompactStockCard({ ticker, stock }) {
  const price     = stock?.price;
  const change    = stock?.change;
  const changePct = stock?.changePct;
  const high52    = stock?.high52w;
  const low52     = stock?.low52w;
  const name      = stock?.name ?? ticker;

  const priceColor  = changePct == null ? GREEN : changePct >= 0 ? GREEN : RED;
  const changeColor = changePct == null ? DIM   : changePct >= 0 ? GREEN : RED;
  const arrow       = changePct == null ? "" : changePct >= 0 ? "▲" : "▼";
  const changeStr   = changePct == null
    ? "—"
    : `${arrow} ${Math.abs(changePct).toFixed(2)}%`;
  const changeAbsStr = change == null
    ? ""
    : `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;

  return (
    <div
      className="panel"
      style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}
    >
      {/* Ticker + name row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: GREEN, fontWeight: 700, letterSpacing: "0.08em" }}>
          {ticker}
        </span>
        <span style={{ fontSize: 9, color: DIM, maxWidth: "60%", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </div>

      {/* Price */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: priceColor,
          fontVariantNumeric: "tabular-nums",
          fontFamily: '"JetBrains Mono", monospace',
          lineHeight: 1,
        }}
      >
        {price != null ? `$${price.toFixed(2)}` : "—"}
      </div>

      {/* Change row */}
      <div style={{ fontSize: 10, color: changeColor, fontVariantNumeric: "tabular-nums", display: "flex", gap: 6 }}>
        {changeAbsStr && <span>{changeAbsStr}</span>}
        <span>{changeStr}</span>
      </div>

      {/* 52W range */}
      {high52 != null && low52 != null && (
        <div style={{ fontSize: 9, color: DIM, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
          52W: ${low52.toFixed(2)} — ${high52.toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ── Stress signal sparkline card ──────────────────────────────────────────────
function StressSignalCard({ seriesKey, signal }) {
  // Determine color: savings up = green; delinquency, credit balances, claims up = red
  const goodWhenUp = seriesKey === "PSAVERT";
  const trend      = signal?.trend; // "up" | "down"
  let valueColor   = DIM;
  if (trend === "up")   valueColor = goodWhenUp ? GREEN : RED;
  if (trend === "down") valueColor = goodWhenUp ? RED   : GREEN;

  const latest    = signal?.latest?.value;
  const change    = signal?.change;
  const unit      = signal?.unit ?? "";
  const name      = signal?.name ?? seriesKey;

  const sparkData = (signal?.data ?? []).map((p) => ({
    date: p.date,
    value: p.value,
  }));

  const arrow      = change == null ? "" : change > 0 ? "▲" : change < 0 ? "▼" : "—";
  const changeAbs  = change != null ? Math.abs(change) : null;
  const changeColor = change == null ? DIM : change > 0 ? (goodWhenUp ? GREEN : RED) : (goodWhenUp ? RED : GREEN);

  // Smart formatting based on series key
  function fmtValue(v, u) {
    if (v == null) return "—";
    if (seriesKey === "ICSA") return `${Math.round(v).toLocaleString("en-US")}K`;
    if (seriesKey === "CCLACBW027SBOG") return `$${Math.round(v).toLocaleString("en-US")}B`;
    if (u === "%") return `${v.toFixed(2)}%`;
    return v.toFixed(2);
  }
  const latestStr  = fmtValue(latest, unit);
  const changeStr  = changeAbs != null ? `${arrow} ${fmtValue(changeAbs, unit)}` : "—";

  const strokeColor = valueColor;

  return (
    <div
      className="panel"
      style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}
    >
      {/* Signal name */}
      <div style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
        {name}
      </div>

      {/* Latest value */}
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
          fontFamily: '"JetBrains Mono", monospace',
          lineHeight: 1,
        }}
      >
        {latestStr}
      </div>

      {/* Change from prior */}
      <div style={{ fontSize: 10, color: changeColor, fontVariantNumeric: "tabular-nums" }}>
        {changeStr}
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id={`stressGrad-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(v) => `${Number(v).toFixed(2)}${unit}`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              name={name}
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#stressGrad-${seriesKey})`}
              dot={false}
              activeDot={{ r: 3, fill: strokeColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AlternativeIndex() {
  // ── Vice stocks state ───────────────────────────────────────────────────────
  const [viceData, setViceData]       = useState(null);
  const [viceLoading, setViceLoading] = useState(true);
  const [viceRange, setViceRange]     = useState("1Y");

  // ── Escorts state ───────────────────────────────────────────────────────────
  const [escortData, setEscortData]       = useState(null);
  const [escortLoading, setEscortLoading] = useState(true);

  // ── Stress signals state ────────────────────────────────────────────────────
  const [stressData, setStressData]       = useState(null);
  const [stressLoading, setStressLoading] = useState(true);

  // ── Fetch vice stocks ───────────────────────────────────────────────────────
  useEffect(() => {
    setViceLoading(true);
    const param = RANGE_PARAMS[viceRange] ?? "1y";
    fetch(`/api/vice-stocks?range=${param}`)
      .then((r) => r.json())
      .then((d) => {
        setViceData(d);
        setViceLoading(false);
      })
      .catch(() => setViceLoading(false));
  }, [viceRange]);

  // ── Fetch escorts ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/escorts")
      .then((r) => r.json())
      .then((d) => {
        setEscortData(d);
        setEscortLoading(false);
      })
      .catch(() => setEscortLoading(false));
  }, []);

  // ── Fetch stress signals ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/stress-signals")
      .then((r) => r.json())
      .then((d) => {
        setStressData(d);
        setStressLoading(false);
      })
      .catch(() => setStressLoading(false));
  }, []);

  // ── Derived escort data ─────────────────────────────────────────────────────
  const escortCities = escortData?.cities ?? [];
  const escortTotal  = escortData?.total ?? null;
  const sortedCities = [...escortCities].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const maxCount     = sortedCities[0]?.count ?? 1;

  // ── Derived vice stocks data ────────────────────────────────────────────────
  const stocksObj  = viceData?.stocks ?? {};
  const categories = viceData?.categories ?? {};
  const rickStock  = stocksObj.RICK ?? null;

  // Ordered category list (preserving API key order)
  const categoryEntries = Object.entries(categories);

  // ── Derived stress signals data ─────────────────────────────────────────────
  const signals        = stressData?.signals ?? {};
  const STRESS_ORDER   = ["PSAVERT", "DRCCLACBS", "CCLACBW027SBOG", "ICSA"];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "12px 16px" }}>

      {/* ── Header ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          $ Alternative Index
        </div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
          — Vice Stocks, Escort Economy, Stress Signals
        </div>
      </div>

      {/* ── Section 1: Vice Stocks ── */}
      <div>
        <SectionLabel>Vice Stocks</SectionLabel>

        {/* Range selector */}
        <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
          {["1M", "3M", "6M", "1Y", "5Y"].map((r) => (
            <RangeButton
              key={r}
              label={r}
              active={viceRange === r}
              onClick={() => setViceRange(r)}
            />
          ))}
        </div>

        {viceLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* RICK anchor chart — full width */}
            {categories["Adult Entertainment"] && rickStock && (
              <div>
                <CategoryLabel>Adult Entertainment</CategoryLabel>
                <RickChartPanel stock={rickStock} range={viceRange} />
              </div>
            )}

            {/* All other categories as compact price grids */}
            {categoryEntries
              .filter(([cat]) => cat !== "Adult Entertainment")
              .map(([cat, tickers]) => (
                <div key={cat}>
                  <CategoryLabel>{cat}</CategoryLabel>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {tickers.map((t) =>
                      stocksObj[t] ? (
                        <CompactStockCard key={t} ticker={t} stock={stocksObj[t]} />
                      ) : (
                        <div key={t} className="panel" style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, color: DIM }}>{t} — no data</div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Escort Economy Index ── */}
      <div>
        <SectionLabel>Escort Economy Index</SectionLabel>

        {escortLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : (
          <div className="panel" style={{ padding: 16 }}>
            {/* Total worldwide count */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: CYAN,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {escortTotal != null ? escortTotal.toLocaleString() : "—"}
              </span>
              <span style={{ fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Worldwide listings
              </span>
            </div>

            {/* City table */}
            {sortedCities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Table header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 90px 1fr",
                    gap: 8,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${BORDER}`,
                    marginBottom: 2,
                  }}
                >
                  {["City", "Count", "Per 100K", ""].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 9,
                        color: DIM,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {sortedCities.map((city, idx) => {
                  const isTop5    = idx < 5;
                  const barWidth  = maxCount > 0
                    ? Math.max(2, Math.round((city.count / maxCount) * 100))
                    : 0;
                  const nameColor = isTop5 ? "var(--color-term-text)" : DIM;

                  return (
                    <div
                      key={city.city ?? idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 90px 90px 1fr",
                        gap: 8,
                        alignItems: "center",
                        paddingTop: 5,
                        paddingBottom: 5,
                        borderBottom: `1px solid ${BORDER}`,
                      }}
                    >
                      {/* City name */}
                      <div style={{ fontSize: 11, color: nameColor, fontWeight: isTop5 ? 600 : 400 }}>
                        {isTop5 && (
                          <span style={{ color: AMBER, marginRight: 5, fontSize: 9 }}>
                            {idx + 1}.
                          </span>
                        )}
                        {city.city}
                      </div>

                      {/* Count */}
                      <div
                        style={{
                          fontSize: 11,
                          color: CYAN,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {city.count != null ? city.count.toLocaleString() : "—"}
                      </div>

                      {/* Per 100K */}
                      <div
                        style={{
                          fontSize: 11,
                          color: isTop5 ? AMBER : DIM,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {city.per100k != null ? city.per100k.toFixed(1) : "—"}
                      </div>

                      {/* Bar */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <div
                          style={{
                            height: 6,
                            width: `${barWidth}%`,
                            background: isTop5
                              ? `linear-gradient(90deg, ${CYAN}, ${CYAN}88)`
                              : `${CYAN}44`,
                            borderRadius: 2,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: DIM, padding: "8px 0" }}>
                No city data available.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Economic Stress Signals ── */}
      <div>
        <SectionLabel>Economic Stress Signals</SectionLabel>

        {stressLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}
          >
            {STRESS_ORDER.map((key) => (
              <StressSignalCard
                key={key}
                seriesKey={key}
                signal={signals[key] ?? null}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
