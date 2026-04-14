const TABS = [
  { key: "overview", label: "OVERVIEW", num: "1" },
  { key: "rates", label: "RATES", num: "2" },
  { key: "inflation", label: "INFLATION", num: "3" },
  { key: "growth", label: "GROWTH", num: "4" },
  { key: "labor", label: "LABOR", num: "5" },
  { key: "risk", label: "RISK", num: "6" },
  { key: "realestate", label: "REAL ESTATE", num: "7" },
];

export default function TabBar({ active, onSelect }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid hsl(220,15%,14%)",
        paddingLeft: 16,
        paddingRight: 16,
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
              className={isActive ? "glow-green" : ""}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "1px solid hsl(142,70%,55%)"
                  : "1px solid transparent",
                padding: "8px 16px",
                cursor: "pointer",
                color: isActive ? "hsl(142,70%,55%)" : "hsl(220,10%,40%)",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.target.style.color = "hsla(142,70%,55%,0.7)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.target.style.color = "hsl(220,10%,40%)";
              }}
            >
              <span style={{ color: "hsl(220,10%,40%)", marginRight: 4, fontSize: 10 }}>{tab.num}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 10, color: "hsl(220,10%,40%)", letterSpacing: "0.05em" }}>
        KEYS [1-7] TO NAVIGATE
      </span>
    </nav>
  );
}

export { TABS };
