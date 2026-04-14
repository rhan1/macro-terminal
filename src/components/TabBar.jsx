const TABS = [
  { key: "overview", label: "OVERVIEW", num: "1" },
  { key: "rates", label: "RATES", num: "2" },
  { key: "inflation", label: "INFLATION", num: "3" },
  { key: "growth", label: "GROWTH", num: "4" },
  { key: "labor", label: "LABOR", num: "5" },
  { key: "risk", label: "SENTIMENT & RISK", num: "6" },
];

export default function TabBar({ active, onSelect }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--color-term-border)",
        background: "var(--color-term-bg)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 0 }}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--color-term-green)"
                  : "2px solid transparent",
                padding: "10px 16px",
                cursor: "pointer",
                color: isActive
                  ? "var(--color-term-green)"
                  : "var(--color-term-dim)",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                transition: "color 0.2s",
                textShadow: isActive
                  ? "0 0 8px hsla(142,70%,55%,0.4)"
                  : "none",
              }}
            >
              <span style={{ opacity: 0.5, marginRight: 4 }}>{tab.num}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
      <span
        style={{
          fontSize: 9,
          color: "var(--color-term-dim)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        KEYS [1-6] TO NAVIGATE
      </span>
    </nav>
  );
}

export { TABS };
