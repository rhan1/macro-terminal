import { useState, useEffect } from "react";
import Loading from "../components/Loading";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function statusColor(status) {
  if (!status) return DIM;
  const s = status.toLowerCase();
  if (s === "priced") return GREEN;
  if (s === "withdrawn" || s === "postponed") return RED;
  return AMBER;
}

function statusLabel(status) {
  if (!status) return "UPCOMING";
  const s = status.toLowerCase();
  if (s === "priced") return "PRICED";
  if (s.includes("week")) return "WEEK OF";
  if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(s))
    return status.toUpperCase();
  return status.toUpperCase();
}

function formatVolume(mil) {
  if (mil == null) return "—";
  if (mil >= 1000) return `$${(mil / 1000).toFixed(1)}B`;
  return `$${mil.toFixed(0)}M`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const [m, d, y] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

export default function IPO() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | upcoming | priced

  useEffect(() => {
    fetch("/api/ipo")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const ipos = data?.ipos || [];
  const filtered =
    filter === "upcoming"
      ? ipos.filter((i) => i.status?.toLowerCase() !== "priced")
      : filter === "priced"
      ? ipos.filter((i) => i.status?.toLowerCase() === "priced")
      : ipos;

  const totalVolume = ipos.reduce((s, i) => s + (i.estVolumeMil || 0), 0);
  const pricedCount = ipos.filter((i) => i.status?.toLowerCase() === "priced").length;
  const upcomingCount = ipos.length - pricedCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          $ IPO Calendar
        </div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
          — Upcoming &amp; Recent IPOs via IPOScoop
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <div className="panel" style={{ textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total IPOs</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: GREEN, fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
            {ipos.length}
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Upcoming</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: AMBER, fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
            {upcomingCount}
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Recently Priced</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: CYAN, fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
            {pricedCount}
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total Volume</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: GREEN, fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
            {formatVolume(totalVolume)}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { key: "all", label: "ALL" },
          { key: "upcoming", label: "UPCOMING" },
          { key: "priced", label: "PRICED" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? "hsla(142,70%,55%,0.12)" : "transparent",
              border: `1px solid ${filter === f.key ? GREEN : BORDER}`,
              color: filter === f.key ? GREEN : DIM,
              padding: "4px 14px",
              fontSize: 9,
              fontFamily: "inherit",
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {f.label} ({f.key === "all" ? ipos.length : f.key === "upcoming" ? upcomingCount : pricedCount})
          </button>
        ))}
      </div>

      {/* IPO Table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {["STATUS", "DATE", "TICKER", "COMPANY", "PRICE RANGE", "SHARES (M)", "DEAL SIZE", "SECTOR"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontSize: 8,
                    color: DIM,
                    letterSpacing: "0.1em",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 20, textAlign: "center", color: DIM }}>
                  No IPOs found
                </td>
              </tr>
            ) : (
              filtered.map((ipo, i) => (
                <tr
                  key={`${ipo.ticker}-${i}`}
                  style={{
                    borderBottom: `1px solid ${BORDER}`,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "hsla(142,70%,55%,0.04)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      fontSize: 8,
                      fontWeight: 600,
                      color: statusColor(ipo.status),
                      letterSpacing: "0.06em",
                      padding: "2px 6px",
                      border: `1px solid ${statusColor(ipo.status)}`,
                      borderRadius: 2,
                    }}>
                      {statusLabel(ipo.status)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: AMBER, fontFamily: '"JetBrains Mono", monospace', whiteSpace: "nowrap" }}>
                    {formatDate(ipo.expectedTradeDate)}
                  </td>
                  <td style={{ padding: "10px 12px", color: GREEN, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace' }}>
                    {ipo.ticker || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "hsl(0,0%,80%)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ipo.company}
                  </td>
                  <td style={{ padding: "10px 12px", color: CYAN, fontFamily: '"JetBrains Mono", monospace', whiteSpace: "nowrap" }}>
                    {ipo.priceRange || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: DIM, fontFamily: '"JetBrains Mono", monospace', textAlign: "right" }}>
                    {ipo.sharesMil != null ? ipo.sharesMil.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: GREEN, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, whiteSpace: "nowrap" }}>
                    {formatVolume(ipo.estVolumeMil)}
                  </td>
                  <td style={{ padding: "10px 12px", color: CYAN, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ipo.sector || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Source */}
      <div style={{ fontSize: 8, color: "hsl(220,10%,38%)", textAlign: "right" }}>
        Source: IPOScoop.com &middot; Updated: {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : "—"}
      </div>
    </div>
  );
}
