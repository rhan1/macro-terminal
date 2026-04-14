export default function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 4, color: "var(--color-term-dim)", fontSize: 10, letterSpacing: "0.04em" }}>{label}</div>
      {payload.map((entry, i) => {
        const val = formatter ? formatter(entry.value) : entry.value?.toFixed(2);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 2, background: entry.color || "var(--color-term-text)", display: "inline-block", borderRadius: 1, flexShrink: 0 }} />
            <span style={{ color: "var(--color-term-dim)" }}>{entry.name}:</span>
            <span style={{ color: entry.color || "var(--color-term-text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}
