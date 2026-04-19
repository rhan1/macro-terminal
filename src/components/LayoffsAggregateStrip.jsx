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

function fmtDelta(pct) {
  if (pct == null || !isFinite(pct)) return "—";
  // Guard against division-by-near-zero: prior-period had ~0 layoffs.
  if (Math.abs(pct) > 1000) return "N/A";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// Layoffs falling = bullish for labor, so invert the green/red convention:
// decreasing layoffs renders green, rising renders red.
function deltaColor(pct) {
  if (pct == null || !isFinite(pct)) return DIM;
  if (pct <= -5) return GREEN;
  if (pct >= 5) return RED;
  return AMBER;
}

export default function LayoffsAggregateStrip({ aggregates }) {
  if (!aggregates) return null;
  const {
    totalCompanies30d,
    totalHeadcount30d,
    deltaCompaniesPct,
    deltaHeadcountPct,
    sectorBreakdown,
    topSector,
  } = aggregates;

  const sectors = (sectorBreakdown || []).filter((s) => s.headcount > 0);
  const totalShare = sectors.reduce((acc, s) => acc + (s.headcount || 0), 0) || 1;

  return (
    <div
      className="panel"
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: DIM,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Layoffs — last 30 days
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <Chip label="COMPANIES" value={fmtNum(totalCompanies30d)} deltaPct={deltaCompaniesPct} />
        <Chip label="EMPLOYEES" value={fmtNum(totalHeadcount30d)} deltaPct={deltaHeadcountPct} />
        <Chip label="TOP SECTOR" value={topSector || "—"} valueColor={CYAN} />
        <Chip
          label="TRACKED"
          value={`${sectors.length} SECTORS`}
          valueColor={DIM}
        />
      </div>

      {sectors.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              height: 10,
              border: `1px solid ${BORDER}`,
              overflow: "hidden",
            }}
          >
            {sectors.map((s, i) => {
              const widthPct = ((s.headcount || 0) / totalShare) * 100;
              const hue = 180 + ((i * 47) % 180);
              return (
                <div
                  key={s.sector}
                  title={`${s.sector}: ${fmtNum(s.headcount)} (${s.companies} cos)`}
                  style={{
                    width: `${widthPct}%`,
                    background: `hsl(${hue},60%,50%)`,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              fontSize: 9,
              color: DIM,
              letterSpacing: "0.04em",
            }}
          >
            {sectors.slice(0, 6).map((s, i) => {
              const hue = 180 + ((i * 47) % 180);
              return (
                <span key={s.sector} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: `hsl(${hue},60%,50%)`,
                      display: "inline-block",
                    }}
                  />
                  {s.sector.toUpperCase()} · {fmtNum(s.headcount)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, deltaPct, valueColor }) {
  const dColor = deltaColor(deltaPct);
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        padding: "8px 12px",
        background: "hsl(220,20%,9%)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: DIM,
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          fontFamily: '"JetBrains Mono", monospace',
          color: valueColor || "hsl(220,15%,90%)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {deltaPct != null && isFinite(deltaPct) && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: dColor,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {fmtDelta(deltaPct)} vs prior 30d
        </div>
      )}
    </div>
  );
}
