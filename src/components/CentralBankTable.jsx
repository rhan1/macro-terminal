import centralBanksData from "../data/centralBanks.json";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function directionChip(dir) {
  const map = { HIKE: RED, CUT: GREEN, HOLD: DIM };
  return map[dir] || DIM;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export default function CentralBankTable({ banks }) {
  const rows = banks || centralBanksData.banks;

  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Central Bank Pulse
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          Monthly BIS auto-refresh · manual JSON seed
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: DIM, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Bank</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Rate</th>
              <th style={{ padding: "4px 6px" }}>Last Move</th>
              <th style={{ padding: "4px 6px" }}>Next</th>
              <th style={{ padding: "4px 6px" }}>Bias</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.shortName} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ padding: "6px 6px" }}>
                  <div style={{ color: "hsl(220,15%,88%)", fontWeight: 500 }}>
                    {b.flag} {b.shortName}
                  </div>
                  <div style={{ fontSize: 9, color: DIM }}>{b.country}</div>
                </td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontFamily: '"JetBrains Mono", monospace', color: "hsl(220,15%,92%)", fontWeight: 600 }}>
                  {b.currentRate.toFixed(2)}%
                </td>
                <td style={{ padding: "6px 6px" }}>
                  <span style={{
                    fontSize: 9,
                    color: directionChip(b.lastMoveDirection),
                    letterSpacing: "0.06em",
                    fontWeight: 600,
                    marginRight: 6,
                  }}>
                    {b.lastMoveDirection}
                  </span>
                  <span style={{ fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
                    {fmtDate(b.lastMoveDate)}
                  </span>
                </td>
                <td style={{ padding: "6px 6px", fontFamily: '"JetBrains Mono", monospace', color: CYAN, fontSize: 10 }}>
                  {fmtDate(b.nextMeeting)}
                </td>
                <td style={{ padding: "6px 6px", fontSize: 10, color: "hsl(220,15%,75%)" }}>
                  {b.bias}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
