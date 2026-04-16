export default function Loading({ message }) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ color: "var(--color-term-dim)", fontSize: 11, marginBottom: 16 }}>
        {message || "LOADING DATA..."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, margin: "0 auto" }}>
        <div className="loading-bar" style={{ width: "80%" }} />
        <div className="loading-bar" style={{ width: "60%" }} />
        <div className="loading-bar" style={{ width: "70%" }} />
      </div>
    </div>
  );
}
