import { useState, useEffect } from "react";
import Loading from "../components/Loading";
import ChartTooltip from "../components/ChartTooltip";
import EscortHeatMap from "../components/EscortHeatMap";
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

// ── Google Trends stress signal card ─────────────────────────────────────────
function TrendsSignalCard({ termData }) {
  // All 6 terms are distress proxies: high = bad, rising = red/amber, falling = green
  const current   = termData?.current;
  const change    = termData?.change;
  const peak      = termData?.peak;
  const term      = termData?.term ?? "";
  const hasError  = !!termData?.error && !current;

  const sparkData = (termData?.data ?? []).map((p) => ({
    date: p.date,
    value: p.value,
  }));

  // Color logic: rising stress = AMBER (warning), falling stress = GREEN (relief)
  let valueColor  = DIM;
  let changeColor = DIM;
  let strokeColor = AMBER;

  if (current != null) {
    // High absolute interest (>60) = amber, otherwise cyan
    valueColor = current >= 60 ? AMBER : CYAN;
  }
  if (change != null) {
    changeColor = change > 0 ? AMBER : change < 0 ? GREEN : DIM;
    strokeColor = change > 0 ? AMBER : RED;
  }

  const arrow      = change == null ? "" : change > 0 ? "▲" : change < 0 ? "▼" : "–";
  const changeStr  = change == null
    ? "vs 4 wks ago: —"
    : `${arrow} ${Math.abs(change).toFixed(0)} vs 4w ago`;

  const currentStr = current != null ? String(current) : "—";

  return (
    <div
      className="panel"
      style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}
    >
      {/* Term label */}
      <div
        style={{
          fontSize: 9,
          color: DIM,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {term}
      </div>

      {hasError ? (
        <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>no data</div>
      ) : (
        <>
          {/* Current interest (0–100) */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: valueColor,
                fontVariantNumeric: "tabular-nums",
                fontFamily: '"JetBrains Mono", monospace',
                lineHeight: 1,
              }}
            >
              {currentStr}
            </span>
            {peak != null && (
              <span style={{ fontSize: 9, color: DIM }}>
                / {peak} peak
              </span>
            )}
          </div>

          {/* 4-week delta */}
          <div style={{ fontSize: 10, color: changeColor, fontVariantNumeric: "tabular-nums" }}>
            {changeStr}
          </div>

          {/* Sparkline */}
          {sparkData.length > 1 && (
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
                <defs>
                  <linearGradient id={`trendsGrad-${term.replace(/\s+/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} hide />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v) => `${Number(v).toFixed(0)}`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name={term}
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  fill={`url(#trendsGrad-${term.replace(/\s+/g, "-")})`}
                  dot={false}
                  activeDot={{ r: 3, fill: strokeColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* No data yet but no error — key not configured */}
          {sparkData.length === 0 && (
            <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>awaiting data</div>
          )}
        </>
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

  // ── Google Trends stress signals state ─────────────────────────────────────
  const [trendsData, setTrendsData]       = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

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

  // ── Fetch escorts (egs primary; on failure, merge escortdirectory + tryst) ─
  useEffect(() => {
    (async () => {
      const tryFetch = async (path) => {
        try {
          const r = await fetch(path);
          if (!r.ok) return null;
          const d = await r.json();
          if ((d?.countries?.length ?? 0) === 0) return null;
          return d;
        } catch { return null; }
      };

      // Primary: egs (129-country snapshot)
      const egs = await tryFetch("/api/egs");
      if (egs) {
        setEscortData({ ...egs, activeLabel: "eurogirlsescort.es" });
        setEscortLoading(false);
        return;
      }

      // Fallback: merge escortdirectory (base ~22 countries) with tryst gap-fill (14).
      // Rule: escortdirectory value wins where present; tryst fills only gaps.
      const [escorts, tryst] = await Promise.all([
        tryFetch("/api/escorts"),
        tryFetch("/api/tryst"),
      ]);

      if (!escorts && !tryst) {
        setEscortLoading(false);
        return;
      }

      const byIso = new Map();
      for (const c of escorts?.countries ?? []) {
        if (!c?.iso || c.total == null) continue;
        byIso.set(c.iso.toLowerCase(), { ...c, iso: c.iso.toLowerCase(), _source: "escortdirectory.com" });
      }
      for (const c of tryst?.countries ?? []) {
        const iso = (c?.iso || "").toLowerCase();
        if (!iso || c.total == null) continue;
        if (byIso.has(iso)) continue; // escortdirectory wins overlap
        byIso.set(iso, { ...c, iso, _source: "tryst.link" });
      }

      const countries = [...byIso.values()].sort((a, b) => b.total - a.total);
      const totalWorldwide = countries.reduce((s, c) => s + c.total, 0);
      const sources = [];
      if (escorts) sources.push("escortdirectory.com");
      if (tryst) sources.push("tryst.link");

      setEscortData({
        countries,
        totalWorldwide,
        activeLabel: sources.join(" + "),
        fetchedAt: escorts?.fetchedAt || tryst?.fetchedAt,
      });
      setEscortLoading(false);
    })();
  }, []);

  // ── Fetch Google Trends stress signals ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then((d) => {
        setTrendsData(d);
        setTrendsLoading(false);
      })
      .catch(() => setTrendsLoading(false));
  }, []);

  // ── Derived escort data ─────────────────────────────────────────────────────
  const escortCountries = escortData?.countries ?? [];
  const escortTotal     = escortData?.totalWorldwide ?? escortData?.total ?? null;
  const escortSource    = escortData?.activeLabel ?? null;

  // ── Derived vice stocks data ────────────────────────────────────────────────
  const stocksObj  = viceData?.stocks ?? {};
  const categories = viceData?.categories ?? {};
  const groups     = viceData?.groups ?? null;
  const rickStock  = stocksObj.RICK ?? null;

  // Back-compat fallback when API hasn't deployed the `groups` field yet.
  const viceGroupNames = groups?.["Vice Stocks"]
    ?? ["Adult Entertainment", "Gambling & Casinos", "Alcohol", "Dating", "Cannabis"];
  const stressGroupNames = groups?.["Stress Economy"]
    ?? ["Dollar Stores", "Pawn Shops"];

  const viceCategoryEntries = viceGroupNames
    .filter((name) => categories[name])
    .map((name) => [name, categories[name]]);
  const stressCategoryEntries = stressGroupNames
    .filter((name) => categories[name])
    .map((name) => [name, categories[name]]);

  // ── Derived Google Trends data ──────────────────────────────────────────────
  const trendsTerms    = trendsData?.terms ?? [];
  const trendsSource   = trendsData?.source ?? "Google Trends via SerpAPI";
  const trendsNotConfigured = !!trendsData?.error;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "12px 16px" }}>

      {/* ── Header ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          $ Alternative Index
        </div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
          — Vice Stocks, Stress Economy, Escort Economy, Stress Signals
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

            {/* Remaining Vice categories as compact price grids */}
            {viceCategoryEntries
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

      {/* ── Section 2: Stress Economy (dollar stores + pawn) ── */}
      {stressCategoryEntries.length > 0 && (
        <div>
          <SectionLabel>Stress Economy</SectionLabel>

          {viceLoading ? (
            <div style={{ padding: "20px 0" }}>
              <Loading />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {stressCategoryEntries.map(([cat, tickers]) => (
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
      )}

      {/* ── Section 3: Escort Economy Heatmap ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Escort Economy — World Heatmap
          </div>
          {escortSource && (
            <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
              source: {escortSource}
            </div>
          )}
        </div>

        {escortLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : escortCountries.length > 0 ? (
          <EscortHeatMap countries={escortCountries} totalWorldwide={escortTotal} />
        ) : (
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: DIM }}>No country data available.</div>
          </div>
        )}
      </div>

      {/* ── Section 3: Google Trends — Stress Signals ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Google Trends — Stress Signals
          </div>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
            {trendsSource}
          </div>
        </div>

        {trendsLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : trendsNotConfigured ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {[
              "pawn shop near me",
              "payday loan",
              "sell my gold",
              "food bank near me",
              "side hustle",
              "how to make money fast",
            ].map((term) => (
              <TrendsSignalCard
                key={term}
                termData={{ term, current: null, change: null, peak: null, data: [], error: "not configured" }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {trendsTerms.map((t) => (
              <TrendsSignalCard key={t.term} termData={t} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
