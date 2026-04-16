import { useState, useEffect } from "react";
import Loading from "../components/Loading";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE = "hsl(220,20%,7%)";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtAmt(dollars) {
  if (dollars == null) return "—";
  const b = dollars / 1e9;
  return `$${b.toFixed(1)}B`;
}

function fmtYield(v, isDiscountBill = false) {
  if (v == null) return "—";
  return `${v.toFixed(3)}%`;
}

function fmtRatio(v) {
  if (v == null) return "—";
  return v.toFixed(2) + "x";
}

function fmtPct(v) {
  if (v == null) return "—";
  return v.toFixed(1) + "%";
}

function fmtTail(v) {
  if (v == null) return "—";
  const bps = Math.abs(v * 10); // tail is already in yield % (e.g. 0.052 = 5.2bps)
  const sign = v > 0 ? "+" : "-";
  return `${sign}${(Math.abs(v) * 100).toFixed(1)} bps`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtDateFull(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// ── Type badge colors ─────────────────────────────────────────────────────────

function typeColor(type, isTips) {
  if (isTips) return AMBER;
  const t = (type || "").toLowerCase();
  if (t === "bill") return CYAN;
  if (t === "bond") return RED;
  if (t === "note") return GREEN;
  if (t === "frn") return "hsl(280,70%,60%)";
  return DIM;
}

function termLabel(a) {
  if (a.isTips) return `${a.term || a.originalTerm || ""} TIPS`;
  return a.term || a.securityTerm || a.label || "—";
}

// ── Bid-to-cover quality signal ───────────────────────────────────────────────

function btcSignal(btc, type) {
  if (btc == null) return { color: DIM, label: "" };
  const t = (type || "").toLowerCase();
  // Typical healthy ranges: Bills ~2.8-3.5x, Notes ~2.3-2.8x, Bonds ~2.2-2.6x
  const strong = t === "bill" ? 3.0 : 2.5;
  const weak = t === "bill" ? 2.5 : 2.1;
  if (btc >= strong) return { color: GREEN, label: "STRONG" };
  if (btc < weak) return { color: RED, label: "WEAK" };
  return { color: AMBER, label: "OK" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      color: DIM,
      marginBottom: 10,
      fontWeight: 400,
    }}>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 2,
      padding: "6px 10px",
      background: "hsl(220,20%,9%)",
      border: `1px solid ${BORDER}`,
      borderRadius: 3,
      minWidth: 60,
    }}>
      <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || GREEN, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── UPCOMING TABLE ────────────────────────────────────────────────────────────

function UpcomingTable({ auctions }) {
  if (!auctions || auctions.length === 0) {
    return <div style={{ color: DIM, fontSize: 11, padding: "12px 0" }}>No upcoming auctions found.</div>;
  }

  const colStyle = (align = "left") => ({
    padding: "6px 8px",
    fontSize: 10,
    fontFamily: "inherit",
    textAlign: align,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  });

  const headStyle = (align = "left") => ({
    ...colStyle(align),
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: DIM,
    borderBottom: `1px solid ${BORDER}`,
    fontWeight: 400,
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headStyle("left")}>Date</th>
            <th style={headStyle("left")}>Type</th>
            <th style={headStyle("left")}>Term</th>
            <th style={headStyle("right")}>Offering</th>
            <th style={headStyle("left")}>Announce</th>
            <th style={headStyle("left")}>Issue</th>
            <th style={headStyle("left")}>Matures</th>
          </tr>
        </thead>
        <tbody>
          {auctions.map((a, i) => {
            const days = daysFromNow(a.auctionDate);
            const color = typeColor(a.type, a.isTips);
            const isToday = days === 0;
            const isTomorrow = days === 1;
            const dayLabel = isToday ? "TODAY" : isTomorrow ? "TOMORROW" : days != null ? `IN ${days}D` : "";
            return (
              <tr
                key={a.cusip || i}
                style={{
                  borderBottom: `1px solid ${BORDER}`,
                  background: isToday ? "hsla(142,70%,55%,0.04)" : "transparent",
                }}
              >
                <td style={colStyle("left")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ color: isToday ? GREEN : "hsl(0,0%,85%)", fontWeight: isToday ? 600 : 400 }}>
                      {fmtDate(a.auctionDate)}
                    </span>
                    {dayLabel && (
                      <span style={{ fontSize: 8, color: isToday ? GREEN : DIM, letterSpacing: "0.05em" }}>
                        {dayLabel}
                      </span>
                    )}
                  </div>
                </td>
                <td style={colStyle("left")}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color,
                    border: `1px solid ${color}`,
                    borderRadius: 2,
                    padding: "1px 5px",
                    letterSpacing: "0.05em",
                  }}>
                    {(a.type || a.securityType || "—").toUpperCase()}
                    {a.isTips ? " TIPS" : ""}
                  </span>
                </td>
                <td style={{ ...colStyle("left"), color: "hsl(0,0%,85%)" }}>{termLabel(a)}</td>
                <td style={{ ...colStyle("right"), color: CYAN }}>{fmtAmt(a.offeringAmount)}</td>
                <td style={{ ...colStyle("left"), color: DIM, fontSize: 9 }}>{fmtDate(a.announcementDate)}</td>
                <td style={{ ...colStyle("left"), color: DIM, fontSize: 9 }}>{fmtDate(a.issueDate)}</td>
                <td style={{ ...colStyle("left"), color: DIM, fontSize: 9 }}>{fmtDateFull(a.maturityDate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── RECENT RESULTS TABLE ──────────────────────────────────────────────────────

function RecentTable({ auctions, filterType, onFilterChange }) {
  const TYPES = ["All", "Note", "Bond", "Bill", "TIPS"];

  if (!auctions || auctions.length === 0) {
    return <div style={{ color: DIM, fontSize: 11, padding: "12px 0" }}>No recent auction results found.</div>;
  }

  const filtered = filterType === "All"
    ? auctions
    : filterType === "TIPS"
    ? auctions.filter((a) => a.isTips)
    : auctions.filter((a) => (a.type || "").toLowerCase() === filterType.toLowerCase() && !a.isTips);

  const colStyle = (align = "left") => ({
    padding: "6px 8px",
    fontSize: 10,
    fontFamily: "inherit",
    textAlign: align,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    verticalAlign: "top",
  });

  const headStyle = (align = "left") => ({
    ...colStyle(align),
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: DIM,
    borderBottom: `1px solid ${BORDER}`,
    fontWeight: 400,
  });

  return (
    <div>
      {/* Filter buttons */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onFilterChange(t)}
            style={{
              background: filterType === t ? "hsla(142,70%,55%,0.12)" : "none",
              border: `1px solid ${filterType === t ? GREEN : BORDER}`,
              borderRadius: 2,
              padding: "2px 8px",
              fontSize: 9,
              color: filterType === t ? GREEN : DIM,
              cursor: "pointer",
              letterSpacing: "0.05em",
              fontFamily: "inherit",
              textTransform: "uppercase",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headStyle("left")}>Auction</th>
              <th style={headStyle("left")}>Term</th>
              <th style={headStyle("right")}>Offering</th>
              <th style={headStyle("right")}>Yield</th>
              <th style={headStyle("right")}>Tail</th>
              <th style={headStyle("right")}>B/C</th>
              <th style={headStyle("right")}>Indirect %</th>
              <th style={headStyle("right")}>Direct %</th>
              <th style={headStyle("right")}>Dealer %</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => {
              const color = typeColor(a.type, a.isTips);
              const { color: btcColor, label: btcLbl } = btcSignal(a.bidToCoverRatio, a.type);
              const isBill = (a.type || "").toLowerCase() === "bill";
              const yieldVal = isBill ? (a.highDiscountRate ?? a.highInvestmentRate ?? a.yield) : a.highYield ?? a.yield;
              return (
                <tr
                  key={a.cusip || i}
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                >
                  <td style={colStyle("left")}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ color: "hsl(0,0%,85%)", fontWeight: 500 }}>{fmtDate(a.auctionDate)}</span>
                      <span style={{ fontSize: 8, color: DIM, letterSpacing: "0.04em" }}>
                        {a.cusip || ""}
                        {a.isReopening ? " · REOPENING" : ""}
                      </span>
                    </div>
                  </td>
                  <td style={colStyle("left")}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color,
                      border: `1px solid ${color}`,
                      borderRadius: 2,
                      padding: "1px 5px",
                      letterSpacing: "0.04em",
                      marginRight: 4,
                    }}>
                      {(a.type || "").toUpperCase()}{a.isTips ? " TIPS" : ""}
                    </span>
                    <span style={{ color: DIM, fontSize: 9 }}>{termLabel(a)}</span>
                  </td>
                  <td style={{ ...colStyle("right"), color: CYAN }}>{fmtAmt(a.offeringAmount)}</td>
                  <td style={{ ...colStyle("right"), color: "hsl(0,0%,85%)", fontWeight: 500 }}>
                    {isBill ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <span>{fmtYield(a.highDiscountRate)} DR</span>
                        <span style={{ fontSize: 9, color: DIM }}>{fmtYield(a.highInvestmentRate)} BEY</span>
                      </div>
                    ) : fmtYield(yieldVal)}
                  </td>
                  <td style={{ ...colStyle("right"), color: a.tail != null ? (a.tail > 0 ? RED : GREEN) : DIM }}>
                    {fmtTail(a.tail)}
                  </td>
                  <td style={{ ...colStyle("right") }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
                      <span style={{ color: btcColor, fontWeight: 600 }}>{fmtRatio(a.bidToCoverRatio)}</span>
                      {btcLbl && <span style={{ fontSize: 8, color: btcColor, letterSpacing: "0.04em" }}>{btcLbl}</span>}
                    </div>
                  </td>
                  <td style={{ ...colStyle("right"), color: a.indirectPct != null && a.indirectPct >= 60 ? GREEN : a.indirectPct != null && a.indirectPct < 40 ? RED : "hsl(0,0%,85%)" }}>
                    {fmtPct(a.indirectPct)}
                  </td>
                  <td style={{ ...colStyle("right"), color: "hsl(0,0%,85%)" }}>
                    {fmtPct(a.directPct)}
                  </td>
                  <td style={{ ...colStyle("right"), color: DIM }}>
                    {fmtPct(a.primaryDealerPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function Auctions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("All");

  useEffect(() => {
    fetch("/api/auctions?mode=full")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loading />;
  if (error) return (
    <div style={{ padding: 24, color: RED, fontSize: 11 }}>
      ERROR: {error}
    </div>
  );

  const upcoming = data?.upcoming?.auctions || [];
  const recent = data?.recent?.auctions || [];

  // Quick stats from most recent results
  const latestCoupon = recent.find((a) => (a.type || "").toLowerCase() !== "bill" && !a.isTips && a.bidToCoverRatio != null);
  const latestBill = recent.find((a) => (a.type || "").toLowerCase() === "bill" && a.bidToCoverRatio != null);
  const latestTips = recent.find((a) => a.isTips && a.bidToCoverRatio != null);
  const nextAuction = upcoming[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, maxWidth: 1300, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            $ Bond Auctions
          </span>
          <span style={{ fontSize: 10, color: DIM, marginLeft: 8 }}>
            — U.S. Treasury · TreasuryDirect API · No auth required
          </span>
        </div>
        {data?.fetched && (
          <span style={{ fontSize: 9, color: DIM }}>
            Updated {new Date(data.fetched).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Quick-stats row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {nextAuction && (
          <StatPill
            label={`Next — ${termLabel(nextAuction)}`}
            value={fmtDate(nextAuction.auctionDate)}
            color={typeColor(nextAuction.type, nextAuction.isTips)}
          />
        )}
        {latestCoupon && (
          <StatPill
            label={`${termLabel(latestCoupon)} B/C`}
            value={fmtRatio(latestCoupon.bidToCoverRatio)}
            color={btcSignal(latestCoupon.bidToCoverRatio, latestCoupon.type).color}
          />
        )}
        {latestCoupon && (
          <StatPill
            label={`${termLabel(latestCoupon)} Yield`}
            value={fmtYield(latestCoupon.highYield ?? latestCoupon.yield)}
            color="hsl(0,0%,85%)"
          />
        )}
        {latestBill && (
          <StatPill
            label={`${termLabel(latestBill)} B/C`}
            value={fmtRatio(latestBill.bidToCoverRatio)}
            color={btcSignal(latestBill.bidToCoverRatio, "bill").color}
          />
        )}
        {latestTips && (
          <StatPill
            label={`${termLabel(latestTips)} B/C`}
            value={fmtRatio(latestTips.bidToCoverRatio)}
            color={AMBER}
          />
        )}
        <StatPill
          label="Upcoming"
          value={`${upcoming.length} auctions`}
          color={DIM}
        />
      </div>

      {/* Upcoming auctions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 14 }}>
        <SectionLabel>
          Upcoming Auctions ({upcoming.length})
        </SectionLabel>
        <UpcomingTable auctions={upcoming} />
      </div>

      {/* Recent results */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 14 }}>
        <SectionLabel>
          Recent Results — Bid/Cover · Tail · Demand Breakdown
        </SectionLabel>
        <div style={{ fontSize: 9, color: DIM, marginBottom: 10, lineHeight: 1.6 }}>
          <span style={{ color: "hsl(0,0%,65%)" }}>Tail</span>
          {" = high yield minus median yield (positive = weak demand). "}
          <span style={{ color: "hsl(0,0%,65%)" }}>Indirect %</span>
          {" ≈ foreign central banks + asset managers. "}
          <span style={{ color: "hsl(0,0%,65%)" }}>Direct %</span>
          {" ≈ domestic investment managers. "}
          <span style={{ color: "hsl(0,0%,65%)" }}>Dealer %</span>
          {" = primary dealers (residual buyer of last resort)."}
        </div>
        <RecentTable
          auctions={recent}
          filterType={filterType}
          onFilterChange={setFilterType}
        />
      </div>

    </div>
  );
}
