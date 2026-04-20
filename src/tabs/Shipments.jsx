import { useMemo, useState } from "react";
import { useShipmentsData } from "../hooks/useShipmentsData";
import { useMaradData } from "../hooks/useMaradData";
import { usePortwatchData } from "../hooks/usePortwatchData";
import ShipmentsMap, { CHOKEPOINTS as MAP_CHOKEPOINTS } from "../components/ShipmentsMap";
import AsOfPill from "../components/AsOfPill";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE = "hsl(220,20%,9%)";
const REGION_COLORS = {
  "Red Sea": "hsl(2,80%,58%)",
  "Bab el-Mandeb": "hsl(24,85%,58%)",
  "Gulf of Aden": "hsl(42,90%,55%)",
  "Arabian Sea": "hsl(190,70%,52%)",
  "Somali Basin": "hsl(166,60%,48%)",
  "Strait of Hormuz": "hsl(286,58%,62%)",
  "Persian Gulf": "hsl(320,65%,60%)",
  "Gulf of Oman": "hsl(216,75%,60%)",
  "Suez Canal": "hsl(138,58%,52%)",
  "Black Sea": "hsl(212,48%,55%)",
  "Sea of Azov": "hsl(232,40%,60%)",
  "Indian Ocean": "hsl(176,55%,50%)",
  "Gulf of Guinea": "hsl(34,85%,58%)",
};
const TYPE_COLORS = {
  container: CYAN,
  tanker: AMBER,
  dryBulk: GREEN,
  other: DIM,
};

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function daysAgo(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
}

function fatalityColor(n) {
  if (!n) return DIM;
  if (n >= 10) return RED;
  if (n >= 1) return AMBER;
  return DIM;
}

function formatCompactDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTransitValue(value, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function sparklinePoints(data, width = 180, height = 42) {
  if (!data || data.length < 2) return "";
  const values = data.map((item) => Number(item.total) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(" ");
}

function sumTrendSeries(chokepoints) {
  const totalsByDate = new Map();
  chokepoints.forEach((point) => {
    (point?.trend90d || []).forEach((entry) => {
      const current = totalsByDate.get(entry.date) || {
        date: entry.date,
        total: 0,
        container: 0,
        tanker: 0,
        dryBulk: 0,
        other: 0,
      };
      current.total += Number(entry.total) || 0;
      current.container += Number(entry.container) || 0;
      current.tanker += Number(entry.tanker) || 0;
      current.dryBulk += Number(entry.dryBulk) || 0;
      current.other += Number(entry.other) || 0;
      totalsByDate.set(entry.date, current);
    });
  });
  return [...totalsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ChokepointCard({ name, stats }) {
  const incidents = stats?.incidents || 0;
  const fatalities = stats?.fatalities || 0;
  const latest = stats?.latest;
  const heat = incidents > 20 ? RED : incidents > 5 ? AMBER : incidents > 0 ? CYAN : DIM;
  return (
    <div
      style={{
        background: "hsl(220,20%,9%)",
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${heat}`,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10, color: "hsl(220,15%,85%)", fontWeight: 600, letterSpacing: "0.06em" }}>
        {name.toUpperCase()}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, fontWeight: 600, color: heat }}>
          {incidents}
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.06em" }}>INCIDENTS 12MO</span>
      </div>
      {fatalities > 0 && (
        <div style={{ fontSize: 10, color: fatalityColor(fatalities), fontFamily: '"JetBrains Mono", monospace' }}>
          {fatalities} fatalities
        </div>
      )}
      {latest && (
        <div style={{ fontSize: 9, color: DIM, marginTop: 3 }}>
          Latest: {fmtDate(latest)} ({daysAgo(latest)}d ago)
        </div>
      )}
    </div>
  );
}

function PortwatchCard({ point, totalLabel = "TOTAL TRANSITS", subtitle = null }) {
  const latest = point?.trend90d?.[point.trend90d.length - 1] || null;
  const byType = point?.byType || { container: 0, tanker: 0, dryBulk: 0, other: 0 };
  const sparkline = sparklinePoints(point?.trend90d);
  const typeItems = [
    ["Container", "container"],
    ["Tanker", "tanker"],
    ["Dry Bulk", "dryBulk"],
    ["Other", "other"],
  ];

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 188,
      }}
    >
      <div>
        <div style={{ fontSize: 10, color: DIM, fontWeight: 600, letterSpacing: "0.1em" }}>
          {point?.name?.toUpperCase() || "—"}
        </div>
        <div style={{ marginTop: 6, fontFamily: '"JetBrains Mono", monospace', fontSize: 24, fontWeight: 600, color: "hsl(220,15%,92%)" }}>
          {latest?.total ?? point?.totalCalls ?? 0}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2, fontSize: 9, color: DIM, letterSpacing: "0.06em" }}>
          <span>{totalLabel}</span>
          <span>{formatCompactDate(point?.latestDate || latest?.date)}</span>
        </div>
        {subtitle && (
          <div style={{ marginTop: 3, fontSize: 9, color: DIM }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {typeItems.map(([label, key]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: TYPE_COLORS[key],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: DIM, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
            <span style={{ marginLeft: "auto", paddingLeft: 4, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "hsl(220,15%,88%)", flexShrink: 0 }}>
              {byType[key] || 0}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto" }}>
        <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", marginBottom: 6 }}>90D TREND</div>
        {sparkline ? (
          <svg width="100%" height="42" viewBox="0 0 180 42" preserveAspectRatio="none" style={{ display: "block" }}>
            <polyline
              points={sparkline}
              fill="none"
              stroke={CYAN}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div style={{ fontSize: 10, color: DIM }}>No trend data.</div>
        )}
      </div>
    </div>
  );
}

function IncidentRow({ ev, i, last }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 110px 1fr auto",
        gap: 10,
        alignItems: "baseline",
        padding: "7px 0",
        borderBottom: !last ? `1px solid ${BORDER}` : "none",
        fontSize: 11,
        color: "var(--color-term-text)",
      }}
    >
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: DIM, minWidth: 72 }}>
        {fmtDate(ev.date)}
      </span>
      <span
        style={{
          fontSize: 9,
          color: ev.chokepoint ? CYAN : DIM,
          letterSpacing: "0.04em",
          textAlign: "left",
        }}
      >
        {ev.chokepoint || ev.country?.toUpperCase()}
      </span>
      <span style={{ fontSize: 11, color: "hsl(220,15%,88%)", lineHeight: 1.35 }}>
        <span style={{ color: AMBER, fontSize: 9, letterSpacing: "0.06em" }}>
          {(ev.subType || "").toUpperCase()}
        </span>
        {" · "}
        <span style={{ color: "hsl(220,15%,72%)" }}>{ev.location}</span>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{ev.notes}</div>
      </span>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: fatalityColor(ev.fatalities), textAlign: "right", minWidth: 48 }}>
        {ev.fatalities > 0 ? `${ev.fatalities} K` : "—"}
      </span>
    </div>
  );
}

function MaradAdvisoryRow({ advisory, last }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "118px minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: !last ? `1px solid ${BORDER}` : "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: DIM }}>
          {fmtDate(advisory.issuedAt)}
        </span>
        <span
          style={{
            display: "inline-flex",
            width: "fit-content",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: CYAN,
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            padding: "3px 6px",
            letterSpacing: "0.05em",
          }}
        >
          {advisory.advisoryNumber}
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: "hsl(220,15%,90%)",
            fontSize: 13,
            lineHeight: 1.35,
            fontWeight: 600,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {advisory.title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {advisory.regionTags.map((tag) => (
            <span
              key={`${advisory.advisoryNumber}-${tag}`}
              style={{
                fontSize: 9,
                color: REGION_COLORS[tag] || CYAN,
                border: `1px solid ${REGION_COLORS[tag] || BORDER}`,
                background: SURFACE,
                padding: "2px 6px",
                letterSpacing: "0.04em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <a
        href={advisory.url}
        target="_blank"
        rel="noreferrer"
        style={{
          color: CYAN,
          fontSize: 10,
          textDecoration: "none",
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          paddingTop: 2,
        }}
      >
        READ →
      </a>
    </div>
  );
}

export default function Shipments() {
  const { data, loading } = useShipmentsData();
  const { data: maradData, loading: maradLoading } = useMaradData();
  const { data: portwatchData, loading: portwatchLoading } = usePortwatchData();
  const [filterChokepoint, setFilterChokepoint] = useState("ALL");
  const [query, setQuery] = useState("");
  const [showAllAdvisories, setShowAllAdvisories] = useState(false);

  const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
  const byChokepoint = data?.byChokepoint || {};
  const chokepointList = data?.chokepoints || [];
  const advisories = Array.isArray(maradData?.advisories) ? maradData.advisories : [];
  const visibleAdvisories = showAllAdvisories ? advisories.slice(0, 30) : advisories.slice(0, 10);
  const portwatchChokepoints = Array.isArray(portwatchData?.chokepoints) ? portwatchData.chokepoints : [];
  const uniquePortwatchChokepoints = portwatchChokepoints.filter((point) => point?.unique !== false);
  const globalTrend = sumTrendSeries(uniquePortwatchChokepoints);
  const latestGlobal = globalTrend[globalTrend.length - 1] || null;
  const latestPortwatchDate = uniquePortwatchChokepoints.reduce((latestDate, point) => {
    const candidate = point?.latestDate || point?.trend90d?.[point.trend90d.length - 1]?.date || null;
    if (!candidate) return latestDate;
    if (!latestDate) return candidate;
    return candidate > latestDate ? candidate : latestDate;
  }, null);
  const globalCard = {
    name: "Total Global Transits",
    latestDate: latestGlobal?.date || null,
    totalCalls: latestGlobal?.total || 0,
    byType: latestGlobal
      ? {
          container: latestGlobal.container,
          tanker: latestGlobal.tanker,
          dryBulk: latestGlobal.dryBulk,
          other: latestGlobal.other,
        }
      : { container: 0, tanker: 0, dryBulk: 0, other: 0 },
    trend90d: globalTrend,
  };
  const mappedChokepoints = useMemo(() => {
    return MAP_CHOKEPOINTS.map((point) => {
      const match = portwatchChokepoints.find(
        (entry) => entry?.name?.trim().toUpperCase() === point.name.toUpperCase()
      );
      return {
        name: point.name,
        transits7d: match?.transits7d,
        transitsPerDay: match?.transitsPerDay,
      };
    });
  }, [portwatchChokepoints]);

  const filtered = incidents.filter((ev) => {
    if (filterChokepoint !== "ALL" && ev.chokepoint !== filterChokepoint) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = `${ev.location || ""} ${ev.notes || ""} ${ev.actor1 || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalFatalities = incidents.reduce((n, e) => n + (e.fatalities || 0), 0);
  const recentCount = incidents.filter((e) => {
    const days = daysAgo(e.date);
    return days != null && days <= 30;
  }).length;
  const latestAcledIncidentDate = incidents.reduce((latestDate, ev) => {
    const candidate = ev?.date;
    if (!candidate) return latestDate;
    if (!latestDate) return candidate;
    return candidate > latestDate ? candidate : latestDate;
  }, null) || new Date(Date.now() - 365 * 86_400_000).toISOString();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 24, color: GREEN, letterSpacing: "0.08em", fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>
          $ SHIPMENTS
        </div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
          — Chokepoint Traffic & Maritime Incidents · Red Sea / Hormuz / Suez via ACLED
        </div>
      </div>

      {recentCount > 5 && (
        <div className="panel" style={{ padding: "10px 14px", borderLeft: `3px solid ${AMBER}` }}>
          <span style={{ color: AMBER, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            ⚠ {recentCount} maritime incidents reported in last 30 days
          </span>
        </div>
      )}

      {/* KPI strip */}
      <div className="panel" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label="INCIDENTS 12MO" value={incidents.length} />
        <Kpi label="FATALITIES 12MO" value={totalFatalities} color={fatalityColor(totalFatalities)} />
        <Kpi label="RECENT 30D" value={recentCount} color={recentCount > 10 ? RED : AMBER} />
        <Kpi label="CHOKEPOINTS" value={chokepointList.length} color={CYAN} small />
        <Kpi label="WINDOW" value={`${data?.windowDays || 365}D`} color={DIM} small />
      </div>

      <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: CYAN, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
            Chokepoint Transit Volumes
          </span>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.06em" }}>
            IMF PortWatch
          </span>
          <AsOfPill date={latestPortwatchDate} />
          <span style={{ marginLeft: "auto", fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
            {portwatchData?.updatedAt ? `Updated ${fmtDate(portwatchData.updatedAt)}` : "Waiting for seed"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {!portwatchLoading && portwatchChokepoints.length === 0 && (
            <div style={{ fontSize: 11, color: DIM, gridColumn: "1 / -1" }}>
              PortWatch feed not yet seeded.
            </div>
          )}
          {uniquePortwatchChokepoints.map((point) => (
            <PortwatchCard key={point.name} point={point} />
          ))}
          <PortwatchCard point={globalCard} totalLabel="TOTAL GLOBAL TRANSITS" subtitle="(unique sources only)" />
        </div>
      </div>

      {/* Incident map */}
      <div className="panel" style={{ padding: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "7 1 420px", minWidth: 0 }}>
            <ShipmentsMap
              incidents={incidents
                .filter((ev) => ev.lat != null && ev.lon != null)
                .slice(0, 200)
                .map((ev) => ({
                  lat: Number(ev.lat),
                  lng: Number(ev.lon),
                  location: ev.location,
                  eventType: ev.subType || ev.eventType,
                  fatalities: Number(ev.fatalities) || 0,
                  date: ev.date,
                }))}
              chokepoints={mappedChokepoints}
              width={1200}
              height={500}
            />
          </div>

          <div
            style={{
              flex: "3 1 200px",
              minWidth: 200,
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              padding: "10px 12px",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "28px minmax(0, 1fr) 74px 58px",
                gap: 8,
                fontSize: 10,
                color: DIM,
                letterSpacing: "0.08em",
                paddingBottom: 8,
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <span>#</span>
              <span>CHOKEPOINT</span>
              <span style={{ textAlign: "right" }}>7D TRANSITS</span>
              <span style={{ textAlign: "right" }}>PER DAY</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {mappedChokepoints.map((point, index) => (
                <div
                  key={point.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px minmax(0, 1fr) 74px 58px",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: index < mappedChokepoints.length - 1 ? `1px solid ${BORDER}` : "none",
                    fontSize: 11,
                    color: "hsl(220,15%,88%)",
                  }}
                >
                  <span style={{ color: AMBER }}>{index + 1}</span>
                  <span style={{ minWidth: 0 }}>{point.name}</span>
                  <span style={{ textAlign: "right" }}>{formatTransitValue(point.transits7d)}</span>
                  <span style={{ textAlign: "right" }}>{formatTransitValue(point.transitsPerDay, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chokepoint grid */}
      <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Chokepoint Activity
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
          {chokepointList.length === 0 && (
            <div style={{ fontSize: 11, color: DIM, gridColumn: "1 / -1" }}>
              Shipments feed not yet seeded.
            </div>
          )}
          {chokepointList.map((name) => (
            <ChokepointCard key={name} name={name} stats={byChokepoint[name]} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: CYAN, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Live Maritime Advisories
          </span>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
            via maritime.dot.gov · refreshed every 6h
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {maradLoading && <div style={{ fontSize: 11, color: DIM }}>Loading MARAD advisories…</div>}
          {!maradLoading && maradData?.error === "not-yet-seeded" && (
            <div style={{ fontSize: 11, color: DIM }}>Awaiting first MARAD refresh — runs every 6h</div>
          )}
          {!maradLoading && maradData?.error !== "not-yet-seeded" && advisories.length === 0 && (
            <div style={{ fontSize: 11, color: DIM }}>No MARAD advisories available.</div>
          )}
          {visibleAdvisories.map((advisory, i) => (
            <MaradAdvisoryRow
              key={advisory.advisoryNumber || advisory.url || i}
              advisory={advisory}
              last={i === visibleAdvisories.length - 1}
            />
          ))}
        </div>

        {!maradLoading && advisories.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllAdvisories((value) => !value)}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: CYAN,
              padding: "6px 10px",
              fontSize: 10,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {showAllAdvisories ? "SHOW LESS" : `SHOW MORE (${Math.min(advisories.length, 30) - 10})`}
          </button>
        )}
      </div>

      {/* Incident feed */}
      <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            ACLED Historical (12-Mo Rolling)
          </span>
          <AsOfPill date={latestAcledIncidentDate} />
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
            via ACLED · maritime-filtered
          </span>
        </div>
        <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: DIM }}>
          Historical reference — see MARAD advisories panel above for current events
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={filterChokepoint}
            onChange={(e) => setFilterChokepoint(e.target.value)}
            style={{
              background: "hsl(220,20%,9%)",
              border: `1px solid ${BORDER}`,
              color: "hsl(220,15%,85%)",
              fontFamily: "inherit",
              fontSize: 10,
              padding: "4px 8px",
              letterSpacing: "0.05em",
            }}
          >
            <option value="ALL">ALL CHOKEPOINTS</option>
            {chokepointList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location / actor / notes…"
            style={{
              background: "hsl(220,20%,9%)",
              border: `1px solid ${BORDER}`,
              color: "hsl(220,15%,85%)",
              fontFamily: "inherit",
              fontSize: 10,
              padding: "4px 8px",
              flex: 1,
              minWidth: 220,
              outline: "none",
            }}
          />
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
            {filtered.length} of {incidents.length}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {loading && <div style={{ fontSize: 11, color: DIM }}>Loading incidents…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ fontSize: 11, color: DIM }}>No incidents match the current filters.</div>
          )}
          {filtered.slice(0, 60).map((ev, i) => (
            <IncidentRow key={ev.id || i} ev={ev} i={i} last={i === Math.min(filtered.length, 60) - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, small }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", background: "hsl(220,20%,9%)" }}>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: small ? 12 : 18,
        fontWeight: 600,
        fontFamily: '"JetBrains Mono", monospace',
        color: color || "hsl(220,15%,90%)",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}
