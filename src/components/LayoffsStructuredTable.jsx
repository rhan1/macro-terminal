import { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, ReferenceLine, YAxis } from "recharts";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtNum(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pctSinceTrade(item) {
  const chart = item?.marketData?.chart;
  if (!Array.isArray(chart) || chart.length < 2) return null;
  if (!item?.announcement_date) return null;
  const target = new Date(item.announcement_date).getTime();
  let announceIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < chart.length; i++) {
    const t = new Date(chart[i].date).getTime();
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      announceIdx = i;
    }
  }
  const announcePrice = chart[announceIdx]?.close;
  const latest = chart[chart.length - 1]?.close;
  if (!announcePrice || !latest) return null;
  return ((latest / announcePrice) - 1) * 100;
}

function Sparkline({ item }) {
  const chart = item?.marketData?.chart;
  if (!Array.isArray(chart) || chart.length === 0) {
    return (
      <span style={{ color: DIM, fontSize: 9, letterSpacing: "0.04em" }}>
        no chart data
      </span>
    );
  }
  if (chart.length < 2) return <span style={{ color: DIM, fontSize: 10 }}>—</span>;
  const since = pctSinceTrade(item);
  const color = since == null ? DIM : since >= 0 ? GREEN : RED;
  const target = item?.announcement_date ? new Date(item.announcement_date).getTime() : null;
  let refDate = null;
  if (target) {
    let best = Infinity;
    for (const pt of chart) {
      const diff = Math.abs(new Date(pt.date).getTime() - target);
      if (diff < best) { best = diff; refDate = pt.date; }
    }
  }
  return (
    <div style={{ width: 80, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {refDate && <ReferenceLine x={refDate} stroke={AMBER} strokeWidth={1} strokeDasharray="2 2" />}
          <Line type="monotone" dataKey="close" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function LayoffsStructuredTable({ items }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [publicOnly, setPublicOnly] = useState(false);
  const [query, setQuery] = useState("");

  const sectors = useMemo(() => {
    const s = new Set();
    for (const it of items) if (it.sector) s.add(it.sector);
    return ["ALL", ...Array.from(s).sort()];
  }, [items]);

  const rows = useMemo(() => {
    let filtered = items.slice();
    if (sectorFilter !== "ALL") filtered = filtered.filter((i) => i.sector === sectorFilter);
    if (publicOnly) filtered = filtered.filter((i) => !!i.ticker);
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          (i.company || "").toLowerCase().includes(q) ||
          (i.ticker || "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "desc" ? -1 : 1;
    filtered.sort((a, b) => {
      const va =
        sortKey === "date" ? new Date(a.announcement_date || 0).getTime() :
        sortKey === "headcount" ? (a.headcount ?? -1) :
        sortKey === "pct" ? (pctSinceTrade(a) ?? -9999) :
        (a.company || "").localeCompare(b.company || "");
      const vb =
        sortKey === "date" ? new Date(b.announcement_date || 0).getTime() :
        sortKey === "headcount" ? (b.headcount ?? -1) :
        sortKey === "pct" ? (pctSinceTrade(b) ?? -9999) :
        0;
      if (sortKey === "company") return dir * (a.company || "").localeCompare(b.company || "");
      return dir * (va - vb);
    });
    return filtered;
  }, [items, sortKey, sortDir, sectorFilter, publicOnly, query]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div
      className="panel"
      style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: RED,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Structured layoff filings
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          via SEC 8-K · Claude Haiku · Google News
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
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
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={{ fontSize: 10, color: DIM, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={publicOnly}
            onChange={(e) => setPublicOnly(e.target.checked)}
          />
          PUBLIC ONLY
        </label>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or ticker…"
          style={{
            background: "hsl(220,20%,9%)",
            border: `1px solid ${BORDER}`,
            color: "hsl(220,15%,85%)",
            fontFamily: "inherit",
            fontSize: 10,
            padding: "4px 8px",
            flex: 1,
            minWidth: 180,
            outline: "none",
          }}
        />

        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          {rows.length} of {items.length}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: DIM, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <Th label="DATE" active={sortKey === "date"} dir={sortDir} onClick={() => toggleSort("date")} />
              <Th label="COMPANY" active={sortKey === "company"} dir={sortDir} onClick={() => toggleSort("company")} />
              <Th label="SOURCE" />
              <Th label="TICKER" />
              <Th label="30D" />
              <Th label="Δ SINCE" active={sortKey === "pct"} dir={sortDir} onClick={() => toggleSort("pct")} align="right" />
              <Th label="HEADS" active={sortKey === "headcount"} dir={sortDir} onClick={() => toggleSort("headcount")} align="right" />
              <Th label="% WORKFORCE" align="right" />
              <Th label="SECTOR" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "12px 0", color: DIM, fontSize: 11 }}>
                  No matching layoffs in the structured feed yet.
                </td>
              </tr>
            )}
            {rows.slice(0, 60).map((it, i) => {
              const since = pctSinceTrade(it);
              const sinceColor = since == null ? DIM : since >= 0 ? GREEN : RED;
              return (
                <tr
                  key={`${it.company}-${it.announcement_date}-${i}`}
                  style={{
                    borderTop: `1px solid ${BORDER}`,
                    color: "var(--color-term-text)",
                  }}
                >
                  <Td>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: DIM, fontSize: 10 }}>
                      {fmtDate(it.announcement_date)}
                    </span>
                    {daysSince(it.announcement_date) != null && (
                      <div style={{ fontSize: 9, color: "hsl(220,10%,35%)" }}>
                        {daysSince(it.announcement_date)}d ago
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div style={{ color: "hsl(220,15%,90%)", fontWeight: 500 }}>{it.company || "—"}</div>
                  </Td>
                  <Td>
                    {it.source_url ? (
                      <a
                        href={it.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: AMBER, fontSize: 9, textDecoration: "none" }}
                      >
                        ↗
                      </a>
                    ) : (
                      <span style={{ color: DIM, fontSize: 10 }}>—</span>
                    )}
                  </Td>
                  <Td>
                    {it.ticker ? (
                      <a
                        href={`https://finance.yahoo.com/quote/${encodeURIComponent(it.ticker)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: CYAN,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 600,
                          textDecoration: "none",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {it.ticker}
                      </a>
                    ) : (
                      <span style={{
                        color: DIM,
                        fontSize: 9,
                        padding: "1px 4px",
                        border: `1px solid ${BORDER}`,
                        letterSpacing: "0.08em",
                      }}>PRIVATE</span>
                    )}
                  </Td>
                  <Td>
                    <Sparkline item={it} />
                  </Td>
                  <Td align="right">
                    <span style={{ color: sinceColor, fontFamily: '"JetBrains Mono", monospace', fontSize: 10 }}>
                      {fmtPct(since)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: "hsl(220,15%,88%)" }}>
                      {fmtNum(it.headcount)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: DIM, fontSize: 10 }}>
                      {it.pct_workforce != null ? `${it.pct_workforce.toFixed(1)}%` : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: DIM, fontSize: 10, letterSpacing: "0.04em" }}>
                      {(it.sector || "—").toUpperCase()}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, active, dir, onClick, align = "left" }) {
  const isClickable = !!onClick;
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "6px 6px",
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
        color: active ? CYAN : DIM,
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}{active && (dir === "desc" ? " ↓" : " ↑")}
    </th>
  );
}

function Td({ children, align = "left" }) {
  return (
    <td
      style={{
        padding: "8px 6px",
        verticalAlign: "middle",
        textAlign: align,
      }}
    >
      {children}
    </td>
  );
}
