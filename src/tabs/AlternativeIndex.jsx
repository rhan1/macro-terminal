import { useState, useEffect } from "react";
import Loading from "../components/Loading";
import ChartTooltip from "../components/ChartTooltip";
import EscortHeatMap from "../components/EscortHeatMap";
import IndicatorCard from "../components/IndicatorCard";
import AsOfPill from "../components/AsOfPill";
import { useTsaData } from "../hooks/useTsaData";
import { useBoxOfficeData } from "../hooks/useBoxOfficeData";
import { useManheimData } from "../hooks/useManheimData";
import { useFbxData } from "../hooks/useFbxData";
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

function latestIsoDate(...candidates) {
  const dates = candidates
    .flat()
    .filter(Boolean)
    .filter((value) => !Number.isNaN(new Date(value).getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((latestDate, candidate) => (
    new Date(candidate).getTime() > new Date(latestDate).getTime() ? candidate : latestDate
  ));
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

  // ── Escort advertised-rate pilot (median 1h rate, USD) ─────────────────────
  const [ratesData, setRatesData] = useState(null);

  // ── Google Trends stress signals state ─────────────────────────────────────
  const [trendsData, setTrendsData]       = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

  // ── Leisure & Travel signals ───────────────────────────────────────────────
  const { data: tsaData, loading: tsaLoading } = useTsaData();
  const { data: boxData, loading: boxLoading } = useBoxOfficeData();

  // ── Goods & Supply Chain ───────────────────────────────────────────────────
  const { data: manheimData, loading: manheimLoading } = useManheimData();
  const { data: fbxData, loading: fbxLoading } = useFbxData();

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

  // ── Fetch escorts: egs + tryst always merged; escortdirectory last-resort ──
  // Rule: primary source wins any ISO it has; tryst fills ONLY the gaps.
  //       egs is the primary when healthy (129 countries); if egs fails,
  //       escortdirectory becomes primary and tryst still fills its gaps.
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

      const mergeWithGaps = (primary, secondary) => {
        const byIso = new Map();
        for (const c of primary?.countries ?? []) {
          const iso = (c?.iso || "").toLowerCase();
          if (!iso || c.total == null) continue;
          byIso.set(iso, { ...c, iso });
        }
        for (const c of secondary?.countries ?? []) {
          const iso = (c?.iso || "").toLowerCase();
          if (!iso || c.total == null) continue;
          if (byIso.has(iso)) continue; // primary wins overlap
          byIso.set(iso, { ...c, iso });
        }
        return [...byIso.values()].sort((a, b) => b.total - a.total);
      };

      // Fetch all three in parallel — cheap, each endpoint is separately cached.
      const [egs, tryst, escorts] = await Promise.all([
        tryFetch("/api/egs"),
        tryFetch("/api/tryst"),
        tryFetch("/api/escorts"),
      ]);

      let primary = egs;
      let primaryLabel = "eurogirlsescort.es";
      if (!primary) {
        primary = escorts;
        primaryLabel = "escortdirectory.com";
      }
      if (!primary && !tryst) {
        setEscortLoading(false);
        return;
      }

      const countries = mergeWithGaps(primary, tryst);
      const totalWorldwide = countries.reduce((s, c) => s + c.total, 0);
      const sources = [];
      if (primary) sources.push(primaryLabel);
      if (tryst) sources.push("tryst.link");

      setEscortData({
        countries,
        totalWorldwide,
        worldMoMPct: egs?.totalWorldwideMoMPct ?? null,
        activeLabel: sources.join(" + "),
        fetchedAt: primary?.fetchedAt || tryst?.fetchedAt,
      });
      setEscortLoading(false);
    })();
  }, []);

  // ── Fetch escort advertised-rate pilot ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/egs-rates")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error && (d.countries?.length ?? 0) > 0) setRatesData(d); })
      .catch(() => {});
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
  const escortMoM       = escortData?.worldMoMPct ?? null;
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
          — Vice, Stress Economy, Leisure & Travel, Goods & Supply, Escort Economy, Stress Signals
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

      {/* ── Section 3: Leisure & Travel (TSA checkpoints + Box Office) ── */}
      {(() => {
        const tsaLatest = tsaData?.latest ?? null;
        const tsaRows = tsaData?.rows ?? [];
        const tsaSparkData = [...tsaRows]
          .reverse()
          .map((r) => ({ value: r.current }))
          .filter((d) => d.value != null);
        const tsaMm = tsaLatest?.current != null ? tsaLatest.current / 1_000_000 : null;
        const tsaDelta = tsaLatest?.deltaPct ?? null;
        const tsaSignal = tsaDelta == null ? "neutral" : tsaDelta > 0 ? "bullish" : "bearish";
        const tsaDetail = tsaLatest?.current != null
          ? `TSA screened ${tsaLatest.current.toLocaleString()} passengers on ${tsaLatest.date}. ` +
            (tsaDelta != null
              ? `That's ${tsaDelta >= 0 ? "up" : "down"} ${Math.abs(tsaDelta)}% vs ~30 days prior (${tsaLatest.deltaWindow}). `
              : "") +
            "Daily checkpoint volume is a high-frequency proxy for domestic discretionary travel demand — a leading signal for airline, hotel, and leisure-sector earnings."
          : "TSA passenger checkpoint volume — daily count of screened travelers. High-frequency discretionary-travel demand proxy.";

        const weeks = boxData?.weeks ?? [];
        const boxLatest = boxData?.latest ?? null;
        const boxSparkData = [...weeks]
          .reverse()
          .map((w) => ({ value: w.topTenGross }))
          .filter((d) => d.value != null);
        const boxMm = boxLatest?.topTenGross != null ? boxLatest.topTenGross / 1_000_000 : null;
        const boxYoy = boxLatest?.yoyPct ?? null;
        const boxSignal = boxYoy == null ? "neutral" : boxYoy > 0 ? "bullish" : "bearish";
        const boxDetail = boxLatest?.topTenGross != null
          ? `Domestic top-10 weekly gross for ${boxLatest.weekLabel} was ${boxLatest.topTenGross.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}. ` +
            (boxYoy != null ? `That's ${boxYoy >= 0 ? "up" : "down"} ${Math.abs(boxYoy)}% vs the same week last year. ` : "") +
            "Weekly box office is a discretionary-spending barometer — holds up in mild slowdowns, cracks fast in real downturns."
          : "Box Office Mojo weekly domestic top-10 gross. Leisure-spending signal; can flag consumer pullback when it dips.";

        const anyAvailable = tsaData || boxData;
        if (!anyAvailable) return null;
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Leisure & Travel
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
                  source: tsa.gov · boxofficemojo.com
                </div>
                {latestIsoDate(tsaLatest?.date, boxLatest?.weekStart) && (
                  <AsOfPill date={latestIsoDate(tsaLatest?.date, boxLatest?.weekStart)} />
                )}
              </div>
            </div>
            {(tsaLoading || boxLoading) && !tsaData && !boxData ? (
              <div style={{ padding: "20px 0" }}><Loading /></div>
            ) : (
              <div className="grid-2">
                {tsaData && !tsaData.error && tsaLatest?.current != null && (
                  <IndicatorCard
                    label="TSA Checkpoint Volume"
                    value={tsaMm}
                    unit="M"
                    decimals={2}
                    signal={tsaSignal}
                    changeLabel={tsaDelta != null ? `${tsaDelta >= 0 ? "+" : ""}${tsaDelta}% vs 30d` : tsaLatest.date}
                    detail={tsaDetail}
                    source="tsa.gov"
                    sourceUrl={tsaData?.url ?? "https://www.tsa.gov/travel/passenger-volumes"}
                    dateLabel={tsaLatest.date}
                    sparkData={tsaSparkData}
                  />
                )}
                {boxData && !boxData.error && boxLatest?.topTenGross != null && (
                  <IndicatorCard
                    label="Box Office (Top-10 Weekly)"
                    value={boxMm}
                    unit="M"
                    decimals={1}
                    prefix="$"
                    signal={boxSignal}
                    changeLabel={boxYoy != null ? `${boxYoy >= 0 ? "+" : ""}${boxYoy}% YoY` : boxLatest.weekLabel}
                    detail={boxDetail}
                    source="boxofficemojo.com"
                    sourceUrl={boxData?.url ?? "https://www.boxofficemojo.com/weekly/"}
                    dateLabel={boxLatest.weekLabel}
                    sparkData={boxSparkData}
                  />
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Section 4: Goods & Supply Chain (Manheim UVVI + FBX) ── */}
      {(() => {
        const ml = manheimData?.latest ?? null;
        const mh = manheimData?.history ?? [];
        const mSpark = [...mh]
          .reverse()
          .map((p) => ({ value: p.index }))
          .filter((d) => d.value != null);
        const mSignal = ml?.momPct == null
          ? "neutral"
          : ml.momPct > 0 ? "bearish" : "bullish"; // rising used-car prices = inflationary
        const mDetail = ml?.index != null
          ? `Manheim Used Vehicle Value Index hit ${ml.index} in ${ml.period}. ` +
            (ml.momPct != null ? `${ml.momPct >= 0 ? "Up" : "Down"} ${Math.abs(ml.momPct)}% month-over-month. ` : "") +
            (ml.yoyPct != null ? `${ml.yoyPct >= 0 ? "Up" : "Down"} ${Math.abs(ml.yoyPct)}% year-over-year. ` : "") +
            "The MUVVI is a leading indicator of consumer auto purchasing power and subprime auto-credit stress. Rising used-vehicle prices support lender collateral values; falling prices pressure loss-given-default in auto ABS."
          : "Manheim Used Vehicle Value Index — monthly wholesale used-vehicle price signal. A leading indicator of consumer auto purchasing power and auto-credit collateral health.";

        const fl = fbxData?.latest ?? null;
        const fh = fbxData?.history ?? [];
        const fSpark = [...fh]
          .reverse()
          .map((p) => ({ value: p.value }))
          .filter((d) => d.value != null);
        const fSignal = fl?.dayChangePct == null && fl?.yoyPct == null
          ? "neutral"
          : (fl.yoyPct ?? fl.dayChangePct) > 0 ? "bearish" : "bullish"; // rising shipping = inflationary
        const fDetail = fl?.value != null
          ? `The global Freightos Baltic Index (FBX) was $${fl.value.toLocaleString()} per 40ft on ${fl.period}. ` +
            (fl.dayChangePct != null ? `${fl.dayChangePct >= 0 ? "Up" : "Down"} ${Math.abs(fl.dayChangePct)}% day-over-day. ` : "") +
            (fl.yoyPct != null ? `${fl.yoyPct >= 0 ? "Up" : "Down"} ${Math.abs(fl.yoyPct)}% year-over-year. ` : "") +
            "Container shipping rates are a real-time supply-chain and goods-demand signal. The FBX spiked 10× during COVID, collapsed after, and remains a staple chart of alt-macro analysis."
          : "Freightos Baltic Index — global containerized shipping rate in USD per 40-foot equivalent. Real-time supply-chain and goods-demand signal.";

        const anyAvailable = manheimData || fbxData;
        if (!anyAvailable) return null;
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Goods & Supply Chain
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
                  source: coxautoinc.com · freightos.com
                </div>
                {latestIsoDate(ml?.period, fh?.[fh.length - 1]?.date) && (
                  <AsOfPill date={latestIsoDate(ml?.period, fh?.[fh.length - 1]?.date)} />
                )}
              </div>
            </div>
            {(manheimLoading || fbxLoading) && !manheimData && !fbxData ? (
              <div style={{ padding: "20px 0" }}><Loading /></div>
            ) : (
              <div className="grid-2">
                {manheimData && !manheimData.error && ml?.index != null && (
                  <IndicatorCard
                    label="Used Vehicle Value Index"
                    value={ml.index}
                    unit=""
                    decimals={1}
                    signal={mSignal}
                    changeLabel={
                      ml.momPct != null
                        ? `${ml.momPct >= 0 ? "+" : ""}${ml.momPct}% m/m${ml.yoyPct != null ? ` · ${ml.yoyPct >= 0 ? "+" : ""}${ml.yoyPct}% y/y` : ""}`
                        : ml.period
                    }
                    detail={mDetail}
                    source={manheimData?.source ?? "Manheim / Cox Automotive"}
                    sourceUrl={manheimData?.sourceUrl ?? "https://www.coxautoinc.com/insights/manheim-used-vehicle-value-index/"}
                    dateLabel={ml.period}
                    sparkData={mSpark}
                  />
                )}
                {fbxData && !fbxData.error && fl?.value != null && (
                  <IndicatorCard
                    label="FBX Container Rate"
                    value={fl.value}
                    unit=""
                    decimals={0}
                    prefix="$"
                    signal={fSignal}
                    changeLabel={
                      fl.yoyPct != null
                        ? `${fl.yoyPct >= 0 ? "+" : ""}${fl.yoyPct}% y/y${fl.dayChangePct != null ? ` · ${fl.dayChangePct >= 0 ? "+" : ""}${fl.dayChangePct}% d/d` : ""}`
                        : fl.dayChangePct != null
                          ? `${fl.dayChangePct >= 0 ? "+" : ""}${fl.dayChangePct}% d/d`
                          : (fl.period ?? "")
                    }
                    detail={fDetail}
                    source={fbxData?.source ?? "Freightos Baltic Index"}
                    sourceUrl={fbxData?.sourceUrl ?? "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/"}
                    dateLabel={fl.period}
                    sparkData={fSpark}
                  />
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Section 5: Escort Economy Heatmap ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Escort Economy — World Heatmap
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {escortData?.fetchedAt && (
              <AsOfPill date={escortData.fetchedAt} />
            )}
            {escortSource && (
              <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
                source: {escortSource}
              </div>
            )}
          </div>
        </div>

        {escortLoading ? (
          <div style={{ padding: "20px 0" }}>
            <Loading />
          </div>
        ) : escortCountries.length > 0 ? (
          <EscortHeatMap countries={escortCountries} totalWorldwide={escortTotal} worldMoMPct={escortMoM} />
        ) : (
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: DIM }}>No country data available.</div>
          </div>
        )}
      </div>

      {/* ── Section 5b: Escort Advertised Rates (USD/hr) — pilot ── */}
      {ratesData?.countries?.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Median Advertised Rate — 1hr, USD <span style={{ color: AMBER }}>· PILOT</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {ratesData.fetchedAt && <AsOfPill date={ratesData.fetchedAt} />}
              <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
                source: eurogirlsescort.es
              </div>
            </div>
          </div>

          <div className="panel" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: DIM, marginBottom: 12, lineHeight: 1.5 }}>
              Median advertised 1-hour rate, FX-normalized to USD, sampled across{" "}
              {ratesData.nProfilesPerCountry ?? "~18"} profiles/country. A coarse price signal for the alt-economy index.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {[...ratesData.countries]
                .filter((c) => c.medianIncallUsd != null)
                .sort((a, b) => b.medianIncallUsd - a.medianIncallUsd)
                .map((c) => {
                  const topCur = c.currencyMix
                    ? Object.entries(c.currencyMix).sort((a, b) => b[1] - a[1])[0]?.[0]
                    : null;
                  return (
                    <div key={c.iso} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: "var(--color-term-text)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        {c.country}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: CYAN, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                        ${c.medianIncallUsd.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 8.5, color: DIM, marginTop: 5, letterSpacing: "0.03em" }}>
                        n={c.sampleSize ?? "—"}{topCur ? ` · ${topCur}` : ""}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Google Trends — Stress Signals ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Google Trends — Stress Signals
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
              {trendsSource}
            </div>
            {latestIsoDate(...trendsTerms.map((term) => term?.data?.[term.data.length - 1]?.date)) && (
              <AsOfPill date={latestIsoDate(...trendsTerms.map((term) => term?.data?.[term.data.length - 1]?.date))} />
            )}
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
