import { useMemo, useState } from "react";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const PARTY_COLOR = { D: "hsl(220,70%,60%)", R: "hsl(0,70%,60%)", I: DIM };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
}

function sizeLabel(t) {
  if (t.sizeBracket) return t.sizeBracket.replace(/\$/g, "").replace(/,000/g, "K").replace(/ - /, "–");
  if (t.sizeLow != null && t.sizeHigh != null) return `$${Math.round(t.sizeLow / 1000)}K–$${Math.round(t.sizeHigh / 1000)}K`;
  if (typeof t.value === "number" && t.value > 0) {
    // Flight payload gives us size-bracket midpoint in dollars. Format as $NK / $NM
    if (t.value >= 1_000_000) return `$${(t.value / 1_000_000).toFixed(1)}M`;
    if (t.value >= 1_000) return `$${Math.round(t.value / 1_000)}K`;
    return `$${Math.round(t.value)}`;
  }
  return "—";
}

export default function CapitolTradesTable({ trades }) {
  const [sortKey, setSortKey] = useState("filedDate");
  const [sortDir, setSortDir] = useState("desc");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [partyFilter, setPartyFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    let out = trades.slice();
    if (sideFilter !== "ALL") out = out.filter((t) => t.side === sideFilter);
    if (partyFilter !== "ALL") out = out.filter((t) => t.party === partyFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (t) =>
          (t.politician || "").toLowerCase().includes(q) ||
          (t.ticker || "").toLowerCase().includes(q) ||
          (t.issuer || "").toLowerCase().includes(q)
      );
    }
    const sizeValue = (t) => (typeof t.value === "number" && t.value > 0 ? t.value : ((t.sizeLow || 0) + (t.sizeHigh || 0)) / 2);
    const dir = sortDir === "desc" ? -1 : 1;
    out.sort((a, b) => {
      const va =
        sortKey === "filedDate" ? new Date(a.filedDate || 0).getTime() :
        sortKey === "tradeDate" ? new Date(a.tradeDate || 0).getTime() :
        sortKey === "size" ? sizeValue(a) :
        (a.politician || "").localeCompare(b.politician || "");
      const vb =
        sortKey === "filedDate" ? new Date(b.filedDate || 0).getTime() :
        sortKey === "tradeDate" ? new Date(b.tradeDate || 0).getTime() :
        sortKey === "size" ? sizeValue(b) :
        0;
      if (sortKey === "politician") return dir * (a.politician || "").localeCompare(b.politician || "");
      return dir * (va - vb);
    });
    return out;
  }, [trades, sortKey, sortDir, sideFilter, partyFilter, query]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: CYAN, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Latest Filings
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em", marginLeft: "auto" }}>
          via CapitolTrades · STOCK Act disclosures
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <SelectFilter label="SIDE" value={sideFilter} onChange={setSideFilter} options={["ALL", "buy", "sell"]} />
        <SelectFilter label="PARTY" value={partyFilter} onChange={setPartyFilter} options={["ALL", "D", "R", "I"]} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search politician / ticker / issuer…"
          style={{
            background: "hsl(220,20%,9%)",
            border: `1px solid ${BORDER}`,
            color: "hsl(220,15%,85%)",
            fontFamily: "inherit",
            fontSize: 10,
            padding: "4px 8px",
            flex: 1,
            minWidth: 200,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          {rows.length} of {trades.length}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: DIM, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <Th label="FILED" active={sortKey === "filedDate"} dir={sortDir} onClick={() => toggleSort("filedDate")} />
              <Th label="TRADED" active={sortKey === "tradeDate"} dir={sortDir} onClick={() => toggleSort("tradeDate")} />
              <Th label="POLITICIAN" active={sortKey === "politician"} dir={sortDir} onClick={() => toggleSort("politician")} />
              <Th label="TICKER" />
              <Th label="SIDE" />
              <Th label="SIZE" active={sortKey === "size"} dir={sortDir} onClick={() => toggleSort("size")} align="right" />
              <Th label="LAG" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "12px 0", color: DIM, fontSize: 11 }}>
                  No trades match the current filters.
                </td>
              </tr>
            )}
            {rows.slice(0, 100).map((t, i) => {
              const sideColor = t.side === "buy" ? GREEN : t.side === "sell" ? RED : DIM;
              const partyColor = PARTY_COLOR[t.party] || DIM;
              const lag = (() => {
                if (!t.filedDate || !t.tradeDate) return null;
                const a = new Date(t.filedDate).getTime();
                const b = new Date(t.tradeDate).getTime();
                if (isNaN(a) || isNaN(b)) return null;
                return Math.round((a - b) / 86_400_000);
              })();
              return (
                <tr key={`${t.politician}-${t.ticker}-${t.tradeDate}-${i}`} style={{ borderTop: `1px solid ${BORDER}`, color: "var(--color-term-text)" }}>
                  <Td>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: DIM, fontSize: 10 }}>
                      {fmtDate(t.filedDate)}
                    </span>
                    {daysSince(t.filedDate) != null && (
                      <div style={{ fontSize: 9, color: "hsl(220,10%,35%)" }}>{daysSince(t.filedDate)}d ago</div>
                    )}
                  </Td>
                  <Td>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: DIM, fontSize: 10 }}>
                      {fmtDate(t.tradeDate)}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "hsl(220,15%,90%)", fontWeight: 500 }}>{t.politician || "—"}</span>
                      <span style={{
                        fontSize: 9, color: partyColor, fontWeight: 700, letterSpacing: "0.06em",
                        padding: "0 4px", border: `1px solid ${partyColor}`, borderRadius: 2,
                      }}>
                        {t.party || "?"}
                      </span>
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.06em" }}>{t.chamber || "?"}</span>
                    </div>
                  </Td>
                  <Td>
                    {t.ticker ? (
                      <a
                        href={`https://finance.yahoo.com/quote/${encodeURIComponent(t.ticker)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: CYAN, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, textDecoration: "none" }}
                      >
                        {t.ticker}
                      </a>
                    ) : (
                      <span style={{ color: DIM, fontSize: 10 }}>—</span>
                    )}
                    {t.issuer && (
                      <div style={{ fontSize: 9, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                        {t.issuer}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span style={{ fontSize: 10, color: sideColor, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {t.side}
                    </span>
                    {t.securityType && t.securityType !== "stock" && (
                      <div style={{ fontSize: 8, color: AMBER, letterSpacing: "0.08em" }}>
                        {t.securityType.toUpperCase()}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: "hsl(220,15%,88%)", fontSize: 10 }}>
                      {sizeLabel(t)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: lag > 30 ? AMBER : DIM, fontSize: 10 }}>
                      {lag != null ? `${lag}d` : "—"}
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
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "6px 6px",
        cursor: onClick ? "pointer" : "default",
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
  return <td style={{ padding: "7px 6px", verticalAlign: "middle", textAlign: align }}>{children}</td>;
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ fontSize: 9, color: DIM, display: "inline-flex", alignItems: "center", gap: 4, letterSpacing: "0.06em" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "hsl(220,20%,9%)",
          border: `1px solid ${BORDER}`,
          color: "hsl(220,15%,85%)",
          fontFamily: "inherit",
          fontSize: 10,
          padding: "3px 6px",
          letterSpacing: "0.04em",
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
      </select>
    </label>
  );
}
