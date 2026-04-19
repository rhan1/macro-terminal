import { useState } from "react";
import { useShipmentsData } from "../hooks/useShipmentsData";
import ShipmentsMap from "../components/ShipmentsMap";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

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

export default function Shipments() {
  const { data, loading } = useShipmentsData();
  const [filterChokepoint, setFilterChokepoint] = useState("ALL");
  const [query, setQuery] = useState("");

  const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
  const byChokepoint = data?.byChokepoint || {};
  const chokepointList = data?.chokepoints || [];

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

      {/* Incident map */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
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
          width={1200}
          height={500}
        />
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

      {/* Incident feed */}
      <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Incident Feed
          </span>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
            via ACLED · maritime-filtered
          </span>
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
