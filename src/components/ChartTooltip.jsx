export default function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 4, color: "var(--color-term-dim)" }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color || "var(--color-term-text)" }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value?.toFixed(2)}
        </div>
      ))}
    </div>
  );
}
