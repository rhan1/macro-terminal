import centralBanksData from "../data/centralBanks.json";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const AMBER = "hsl(45,90%,55%)";
const CYAN = "hsl(185,70%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function dxy30dChange(dxyQuote) {
  const chart = dxyQuote?.chart;
  if (!Array.isArray(chart) || chart.length < 2) return null;
  const latest = chart[chart.length - 1]?.close;
  const first = chart[0]?.close;
  if (!latest || !first) return null;
  return ((latest / first) - 1) * 100;
}

function globalAdvance(marketData) {
  if (!marketData) return null;
  const symbols = ["^GSPC", "^STOXX", "^N225", "^HSI", "^GDAXI", "^FTSE"];
  let up = 0;
  let down = 0;
  for (const s of symbols) {
    const p = marketData[s]?.changePct;
    if (p == null) continue;
    if (p > 0.1) up++;
    else if (p < -0.1) down++;
  }
  if (up + down === 0) return null;
  return { up, down, total: up + down };
}

function easingStance(banks) {
  const rows = banks || centralBanksData.banks;
  let cuts = 0; let hikes = 0;
  for (const b of rows) {
    if (b.lastMoveDirection === "CUT") cuts++;
    else if (b.lastMoveDirection === "HIKE") hikes++;
  }
  if (cuts > hikes * 2) return { label: "Global easing", color: GREEN };
  if (hikes > cuts * 2) return { label: "Global tightening", color: RED };
  return { label: "Mixed CB stances", color: AMBER };
}

export default function GlobalRegimeBanner({ marketData }) {
  const dxyQuote = marketData?.["^DXY"];
  const dxy30d = dxy30dChange(dxyQuote);
  const adv = globalAdvance(marketData);
  const stance = easingStance();

  const advColor = adv ? (adv.up > adv.down ? GREEN : adv.up < adv.down ? RED : AMBER) : DIM;
  const dxyColor = dxy30d == null ? DIM : dxy30d > 0.5 ? RED : dxy30d < -0.5 ? GREEN : AMBER;

  return (
    <div
      className="panel"
      style={{
        padding: "10px 14px",
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "baseline",
        fontSize: 11,
      }}
    >
      <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
        Global Outlook
      </span>

      <Chip label="INDICES" value={adv ? `${adv.up} UP · ${adv.down} DN` : "—"} color={advColor} />
      <Chip label="DXY 30d" value={fmtPct(dxy30d)} color={dxyColor} />
      <Chip label="CB STANCE" value={stance.label} color={stance.color} />
      <Chip label="GPMI" value="n/a (manual)" color={DIM} />
    </div>
  );
}

function Chip({ label, value, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 9, color: "hsl(220,10%,42%)", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color, fontWeight: 600 }}>{value}</span>
    </span>
  );
}
