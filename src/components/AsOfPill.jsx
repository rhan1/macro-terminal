export default function AsOfPill({ date }) {
  if (!date) return null;

  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const ageMs = Date.now() - timestamp;
  const days = Math.floor(Math.max(0, ageMs) / 86_400_000);
  const color = days < 1 ? "hsl(142,70%,55%)" : days < 7 ? "hsl(45,90%,55%)" : "hsl(0,72%,55%)";
  const label = days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;

  return (
    <span
      title={`Source date: ${new Date(timestamp).toLocaleString()}`}
      style={{
        fontSize: 9,
        color,
        letterSpacing: "0.04em",
        padding: "1px 6px",
        border: `1px solid ${color}`,
        borderRadius: 2,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      AS OF {new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })} · {label}
    </span>
  );
}
