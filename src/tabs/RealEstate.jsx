import { useFredData } from "../hooks/useFredData";
import { SERIES, latest, prior, change, formatNum, formatPct } from "../services/fred";
import IndicatorCard from "../components/IndicatorCard";
import ChartTooltip from "../components/ChartTooltip";
import Loading from "../components/Loading";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN  = "hsl(142,70%,55%)";
const RED    = "hsl(0,72%,55%)";
const AMBER  = "hsl(45,90%,55%)";
const CYAN   = "hsl(185,70%,55%)";
const DIM    = "hsl(220,10%,40%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE = "hsl(220,20%,7%)";

const PANEL = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  padding: 12,
};

const AXIS_TICK = { fontSize: 9, fill: "hsl(220,10%,35%)", fontFamily: "inherit" };

const GRID_PROPS = {
  stroke: BORDER,
  strokeDasharray: "3 3",
  vertical: false,
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonthYear(dateStr) {
  if (!dateStr) return "";
  const [year, month] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

function fmtCardDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return d === "01" ? `${MONTH_NAMES[mi]} ${y}` : `${MONTH_NAMES[mi]} ${parseInt(d, 10)}, ${y}`;
}

function toAsc(arr, n) {
  if (!arr || arr.length === 0) return [];
  return [...arr].slice(0, n).reverse();
}

function fmtDollarK(v) {
  if (v == null || isNaN(v)) return "—";
  return `$${(v / 1000).toFixed(0)}k`;
}

function fmtCommas(v) {
  if (v == null || isNaN(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

function supplyColor(v) {
  if (v == null) return AMBER;
  if (v < 4) return RED;
  if (v <= 6) return AMBER;
  return GREEN;
}

function supplyLabel(v) {
  if (v == null) return "";
  if (v < 4) return "SELLER'S MARKET";
  if (v <= 6) return "BALANCED";
  return "BUYER'S MARKET";
}

// ─── Fetch config ─────────────────────────────────────────────────────────────

const FETCH = {
  CASESHILLER:       SERIES.CASESHILLER,
  MEDPRICE_EXISTING: SERIES.MEDPRICE_EXISTING,
  MEDPRICE_NEW:      SERIES.MEDPRICE_NEW,
  MONTHS_SUPPLY:     SERIES.MONTHS_SUPPLY,
  ACTIVE_LISTINGS:   SERIES.ACTIVE_LISTINGS,
  DAYS_ON_MARKET:    SERIES.DAYS_ON_MARKET,
  HOUSING_STARTS:    SERIES.HOUSING_STARTS,
  PERMITS:           SERIES.PERMITS,
  OER:               SERIES.OER,
  CPI_RENT:          SERIES.CPI_RENT,
  MORTGAGE30:        SERIES.MORTGAGE30,
  EXISTING_SALES:    SERIES.EXISTING_SALES,
  AFFORDABILITY:     SERIES.AFFORDABILITY,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RealEstate() {
  const { data, loading, error } = useFredData(FETCH);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: RED, fontSize: 11 }}>
        ERROR: {error}
      </div>
    );
  }

  // ── Raw arrays (newest-first from FRED) ──
  const csArr        = data.CASESHILLER       || [];
  const existArr     = data.MEDPRICE_EXISTING || [];
  const newArr       = data.MEDPRICE_NEW      || [];
  const supplyArr    = data.MONTHS_SUPPLY     || [];
  const listingsArr  = data.ACTIVE_LISTINGS   || [];
  const domArr       = data.DAYS_ON_MARKET    || [];
  const startsArr    = data.HOUSING_STARTS    || [];
  const permitsArr   = data.PERMITS           || [];
  const oerArr       = data.OER              || [];
  const rentArr      = data.CPI_RENT         || [];
  const mortgageArr  = data.MORTGAGE30        || [];
  const salesArr     = data.EXISTING_SALES   || [];
  const affordArr    = data.AFFORDABILITY    || [];

  // ── Latest / prior values ──
  const csLatest        = latest(csArr);
  const csPrior         = prior(csArr);
  const csChange        = change(csLatest?.value, csPrior?.value);

  const supplyLatest    = latest(supplyArr);
  const supplyPrior     = prior(supplyArr);

  const listingsLatest  = latest(listingsArr);
  const listingsPrior   = prior(listingsArr, 12);          // YoY
  const listingsYoY     = change(listingsLatest?.value, listingsPrior?.value);

  const domLatest       = latest(domArr);
  const domPrior        = prior(domArr);
  const domChange       = domLatest && domPrior
    ? domLatest.value - domPrior.value
    : null;

  const mortgageLatest  = latest(mortgageArr);
  const mortgagePrior   = prior(mortgageArr);
  const mortgageChange  = change(mortgageLatest?.value, mortgagePrior?.value);

  const salesLatest     = latest(salesArr);
  const salesPrior      = prior(salesArr);
  const salesChange     = change(salesLatest?.value, salesPrior?.value);

  const startsLatest    = latest(startsArr);
  const startsPrior     = prior(startsArr);
  const startsChange    = change(startsLatest?.value, startsPrior?.value);

  const affordLatest    = latest(affordArr);
  const affordPrior     = prior(affordArr);
  const affordChange    = change(affordLatest?.value, affordPrior?.value);

  // ── Chart data (oldest-first for rendering) ──

  // Case-Shiller 36 months
  const csChart = toAsc(csArr, 36).map((pt) => ({
    ...pt, label: fmtMonthYear(pt.date),
  }));

  // Median prices — merge existing + new on date
  const existAsc   = toAsc(existArr, 36);
  const newAsc     = toAsc(newArr, 36);
  const priceMap   = new Map();
  for (const pt of existAsc) priceMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), existing: pt.value });
  for (const pt of newAsc) {
    if (priceMap.has(pt.date)) priceMap.get(pt.date).newHome = pt.value;
    else priceMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), newHome: pt.value });
  }
  const priceChart = Array.from(priceMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Months of supply — 24-month mini chart
  const supplyChart = toAsc(supplyArr, 24).map((pt) => ({
    ...pt, label: fmtMonthYear(pt.date),
  }));

  // Active listings — 24-month mini chart
  const listingsChart = toAsc(listingsArr, 24).map((pt) => ({
    ...pt, label: fmtMonthYear(pt.date),
  }));

  // Days on market — 24-month mini chart
  const domChart = toAsc(domArr, 24).map((pt) => ({
    ...pt, label: fmtMonthYear(pt.date),
  }));

  // Construction pipeline — merge starts + permits
  const startsAsc  = toAsc(startsArr, 24);
  const permitsAsc = toAsc(permitsArr, 24);
  const constrMap  = new Map();
  for (const pt of startsAsc) constrMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), starts: pt.value });
  for (const pt of permitsAsc) {
    if (constrMap.has(pt.date)) constrMap.get(pt.date).permits = pt.value;
    else constrMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), permits: pt.value });
  }
  const constrChart = Array.from(constrMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Shelter inflation — merge OER + CPI rent
  const oerAsc   = toAsc(oerArr, 36);
  const rentAsc  = toAsc(rentArr, 36);
  const shelterMap = new Map();
  for (const pt of oerAsc) shelterMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), oer: pt.value });
  for (const pt of rentAsc) {
    if (shelterMap.has(pt.date)) shelterMap.get(pt.date).rent = pt.value;
    else shelterMap.set(pt.date, { date: pt.date, label: fmtMonthYear(pt.date), rent: pt.value });
  }
  const shelterChart = Array.from(shelterMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // ── Signal functions ──
  function csSignal(v) {
    if (v == null) return "neutral";
    if (v > 10 || v < 0) return "bearish";
    if (v >= 2 && v <= 5) return "bullish";
    return "neutral";
  }
  function mortgageSignal(v) {
    if (v == null) return "neutral";
    if (v > 7) return "bearish";
    if (v < 5) return "bullish";
    return "neutral";
  }
  function salesSignal(v, chg) {
    if (v == null) return "neutral";
    if (chg == null) return "neutral";
    return chg > 0 ? "bullish" : chg < 0 ? "bearish" : "neutral";
  }
  function startsSignal(v) {
    if (v == null) return "neutral";
    if (v < 1000) return "bearish";
    if (v > 1500) return "bullish";
    return "neutral";
  }
  function supplySignal(v) {
    if (v == null) return "neutral";
    if (v < 4) return "bearish";
    if (v > 6) return "bullish";
    return "neutral";
  }
  function affordSignal(v) {
    if (v == null) return "neutral";
    if (v < 100) return "bearish";
    if (v > 120) return "bullish";
    return "neutral";
  }

  const scVal  = supplyLatest?.value;
  const scColor = supplyColor(scVal);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── 1. Section Header ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em" }}>
          $ REAL ESTATE &amp; HOUSING
        </div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
          — Prices, Inventory, Construction, Affordability
        </div>
      </div>

      {/* ── 2. Two charts side-by-side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left: Case-Shiller HPI YoY */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            CASE-SHILLER NATIONAL HPI — YOY % CHANGE
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={csChart} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor={GREEN} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(2)}%` : "—"} />}
                cursor={{ stroke: BORDER }}
              />
              <ReferenceLine
                y={0}
                stroke={DIM}
                strokeDasharray="4 3"
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="CS HPI YoY"
                stroke={GREEN}
                strokeWidth={2}
                fill="url(#csGrad)"
                dot={false}
                activeDot={{ r: 3, fill: GREEN }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Median Home Prices */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            MEDIAN HOME PRICES — EXISTING VS NEW
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={priceChart} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtDollarK}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => fmtDollarK(v)} />}
                cursor={{ stroke: BORDER }}
              />
              <Line
                type="monotone"
                dataKey="existing"
                name="Existing"
                stroke={CYAN}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: CYAN }}
              />
              <Line
                type="monotone"
                dataKey="newHome"
                name="New"
                stroke={AMBER}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: AMBER }}
              />
            </LineChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 14, height: 0, borderTop: `1.5px solid ${CYAN}` }} />
              Existing
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 14, height: 0, borderTop: `1.5px solid ${AMBER}` }} />
              New
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Three-panel market health row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Left: Months of Supply */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            MONTHS OF SUPPLY
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: scColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {scVal != null ? formatNum(scVal, 1) : "—"}
          </div>
          <div style={{ fontSize: 9, color: scColor, marginTop: 4, marginBottom: 10, letterSpacing: "0.08em" }}>
            {supplyLabel(scVal)}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={supplyChart} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
              <defs>
                <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor={scColor} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={scColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(1)} mo` : "—"} />}
                cursor={{ stroke: BORDER }}
              />
              <ReferenceLine y={4} stroke={RED} strokeDasharray="3 2" strokeWidth={1} />
              <ReferenceLine y={6} stroke={GREEN} strokeDasharray="3 2" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="value"
                name="Supply"
                stroke={scColor}
                strokeWidth={1.5}
                fill="url(#supplyGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Center: Active Listings */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            ACTIVE LISTINGS
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: CYAN, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {listingsLatest?.value != null ? fmtCommas(listingsLatest.value) : "—"}
          </div>
          <div style={{ fontSize: 9, marginTop: 4, marginBottom: 10 }}>
            {listingsYoY != null ? (
              <span style={{ color: listingsYoY > 0 ? GREEN : RED }}>
                {listingsYoY > 0 ? "▲" : "▼"} {Math.abs(listingsYoY).toFixed(1)}% YoY
              </span>
            ) : (
              <span style={{ color: DIM }}>YoY —</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={listingsChart} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
              <defs>
                <linearGradient id="listingsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor={CYAN} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? fmtCommas(v) : "—"} />}
                cursor={{ stroke: BORDER }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Listings"
                stroke={CYAN}
                strokeWidth={1.5}
                fill="url(#listingsGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Days on Market */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            MEDIAN DAYS ON MARKET
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: AMBER, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {domLatest?.value != null ? Math.round(domLatest.value) : "—"}
          </div>
          <div style={{ fontSize: 9, marginTop: 4, marginBottom: 10 }}>
            {domChange != null ? (
              <span style={{ color: domChange > 0 ? RED : GREEN }}>
                {domChange > 0 ? "▲" : "▼"} {Math.abs(domChange).toFixed(0)} days vs prior
              </span>
            ) : (
              <span style={{ color: DIM }}>Change —</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={domChart} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
              <defs>
                <linearGradient id="domGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="20%" stopColor={AMBER} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={AMBER} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? `${Math.round(v)} days` : "—"} />}
                cursor={{ stroke: BORDER }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="DOM"
                stroke={AMBER}
                strokeWidth={1.5}
                fill="url(#domGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 4. Two charts side-by-side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left: Construction Pipeline */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            CONSTRUCTION — STARTS &amp; PERMITS (SAAR, THOUSANDS)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={constrChart} margin={{ top: 6, right: 8, left: -12, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}K`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(0)}K` : "—"} />}
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
              />
              <Bar dataKey="starts"  name="Starts"  fill={GREEN} radius={[2,2,0,0]} maxBarSize={10} />
              <Bar dataKey="permits" name="Permits" fill={CYAN}  radius={[2,2,0,0]} maxBarSize={10} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 10, height: 10, background: GREEN, borderRadius: 1 }} />
              Starts
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 10, height: 10, background: CYAN, borderRadius: 1 }} />
              Permits
            </div>
          </div>
        </div>

        {/* Right: Shelter Inflation */}
        <div style={PANEL}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, marginBottom: 8 }}>
            SHELTER INFLATION — OER VS CPI RENT (YOY %)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={shelterChart} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<ChartTooltip formatter={(v) => v != null ? `${v.toFixed(2)}%` : "—"} />}
                cursor={{ stroke: BORDER }}
              />
              <ReferenceLine
                y={2}
                stroke={RED}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: "2% Fed Target",
                  position: "insideTopRight",
                  fill: RED,
                  fontSize: 8,
                  fontFamily: "inherit",
                  dy: -4,
                }}
              />
              <Line
                type="monotone"
                dataKey="oer"
                name="OER"
                stroke={AMBER}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: AMBER }}
              />
              <Line
                type="monotone"
                dataKey="rent"
                name="CPI Rent"
                stroke={CYAN}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: CYAN }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 14, height: 0, borderTop: `1.5px solid ${AMBER}` }} />
              OER
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 14, height: 0, borderTop: `1.5px solid ${CYAN}` }} />
              CPI Rent
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: DIM }}>
              <div style={{ width: 16, height: 0, borderTop: `1.5px dashed ${RED}` }} />
              2% Target
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Indicator Cards (3×2) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

        <IndicatorCard
          label="Case-Shiller YoY"
          value={csLatest?.value}
          unit="%"
          decimals={1}
          change={csChange}
          changeLabel={csChange != null ? formatPct(csChange) : undefined}
          direction={csChange != null ? (csChange > 0 ? "up" : csChange < 0 ? "down" : "flat") : undefined}
          signal={csSignal(csLatest?.value)}
          detail="Case-Shiller National Home Price Index, year-over-year % change. The gold standard gauge of US home price appreciation. Readings above 10% signal bubble-like conditions fueled by excess demand or rate-driven distortions. Readings below 0% signal a correction cycle, often coinciding with rising inventory and tightening credit. A 2–5% range is healthy — tracking nominal income growth and keeping affordability stable. Shelter is typically the largest component of household wealth, so a sustained price decline has significant knock-on effects for consumer confidence and bank collateral quality."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/CSUSHPINSA"
          dateLabel={fmtCardDate(latest(csArr)?.date)}
        />

        <IndicatorCard
          label="30Y Mortgage Rate"
          value={mortgageLatest?.value}
          unit="%"
          decimals={2}
          change={mortgageChange}
          changeLabel={mortgageChange != null ? formatPct(mortgageChange) : undefined}
          direction={mortgageChange != null ? (mortgageChange > 0 ? "up" : mortgageChange < 0 ? "down" : "flat") : undefined}
          signal={mortgageSignal(mortgageLatest?.value)}
          detail="30-year fixed mortgage rate. The most direct transmission channel from Fed policy to the housing market. Rates above 7% sharply reduce purchase affordability and volume, locking homeowners into existing low-rate mortgages — the 'lock-in effect' that suppresses existing home inventory. Rates below 5% historically stimulate demand, pull forward purchases, and accelerate home price appreciation. The spread between mortgage rates and the 10-year Treasury signals the degree of mortgage market stress; elevated spreads reflect lender risk aversion or MBS prepayment uncertainty."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/MORTGAGE30US"
          dateLabel={fmtCardDate(latest(mortgageArr)?.date)}
        />

        <IndicatorCard
          label="Existing Home Sales"
          value={salesLatest?.value != null ? salesLatest.value / 1000 : null}
          unit="M SAAR"
          decimals={2}
          change={salesChange}
          changeLabel={salesChange != null ? formatPct(salesChange) : undefined}
          direction={salesChange != null ? (salesChange > 0 ? "up" : salesChange < 0 ? "down" : "flat") : undefined}
          signal={salesSignal(salesLatest?.value, salesChange)}
          detail="Seasonally adjusted annualized rate of existing home sales. A high-frequency proxy for housing market activity. Sustained readings below 4M SAAR reflect a highly constrained market where elevated rates and lock-in effects suppress transaction volume even if prices remain firm. Rising sales signal improving demand or inventory normalization. Falling sales, if concurrent with falling prices, are a leading indicator of broader housing credit stress. Sales volume drives commission income, mortgage origination, and consumer spending on furniture, appliances, and home improvement."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/EXHOSLUSM495S"
          dateLabel={fmtCardDate(latest(salesArr)?.date)}
        />

        <IndicatorCard
          label="Housing Starts"
          value={startsLatest?.value}
          unit="K SAAR"
          decimals={0}
          change={startsChange}
          changeLabel={startsChange != null ? formatPct(startsChange) : undefined}
          direction={startsChange != null ? (startsChange > 0 ? "up" : startsChange < 0 ? "down" : "flat") : undefined}
          signal={startsSignal(startsLatest?.value)}
          detail="New residential construction starts, seasonally adjusted annualized rate (thousands). A leading indicator of construction employment, building materials demand, and future housing supply. Starts below 1,000K signal severe supply contraction — typically driven by prohibitive financing costs or collapsing demand — which reinforces long-run affordability problems. Starts above 1,500K signal supply expansion that, over 12–18 months, relieves price pressure. The gap between starts and household formation rate determines structural supply deficits, which underpin long-run price support."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/HOUST"
          dateLabel={fmtCardDate(latest(startsArr)?.date)}
        />

        <IndicatorCard
          label="Months of Supply"
          value={supplyLatest?.value}
          unit=" months"
          decimals={1}
          change={supplyLatest && supplyPrior ? supplyLatest.value - supplyPrior.value : null}
          changeLabel={supplyLatest && supplyPrior
            ? `${(supplyLatest.value - supplyPrior.value) >= 0 ? "+" : ""}${(supplyLatest.value - supplyPrior.value).toFixed(1)} mo MoM`
            : undefined}
          direction={supplyLatest && supplyPrior
            ? (supplyLatest.value > supplyPrior.value ? "up" : supplyLatest.value < supplyPrior.value ? "down" : "flat")
            : undefined}
          signal={supplySignal(supplyLatest?.value)}
          detail="Months of housing supply — the ratio of homes for sale to monthly sales pace. Below 4 months is a seller's market, historically associated with rapid price appreciation and bidding wars. 4–6 months is the balanced equilibrium range. Above 6 months tilts toward a buyer's market, exerting price softening pressure. Inventory normalization from cycle lows near 1–2 months (post-2020) is structurally bearish for near-term prices but long-run healthy. The pace of normalization is more informative than the level alone — a fast rise in months of supply often precedes material price corrections."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/HOSSUPUSM673N"
          dateLabel={fmtCardDate(latest(supplyArr)?.date)}
        />

        <IndicatorCard
          label="Affordability Index"
          value={affordLatest?.value}
          unit=""
          decimals={1}
          change={affordChange}
          changeLabel={affordChange != null ? formatPct(affordChange) : undefined}
          direction={affordChange != null ? (affordChange > 0 ? "up" : affordChange < 0 ? "down" : "flat") : undefined}
          signal={affordSignal(affordLatest?.value)}
          detail="NAR Housing Affordability Index — measures whether a median-income family can qualify for a mortgage on a median-priced home, assuming 20% down and 25% income-to-payment ratio. A reading of 100 means the median family has exactly enough income to qualify; above 100 means homes are affordable, below 100 means they are not. The affordability index is a function of home prices, mortgage rates, and median household income. It is one of the strongest long-run demand predictors: sustained unaffordability suppresses household formation, demand, and ultimately prices."
          source="FRED"
          sourceUrl="https://fred.stlouisfed.org/series/FIXHAI"
          dateLabel={fmtCardDate(latest(affordArr)?.date)}
        />

      </div>
    </div>
  );
}
