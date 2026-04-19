const TABS = [
  { key: "overview", label: "OVERVIEW", num: "1", subtitle: "Macro regime + today's market drivers" },
  { key: "rates", label: "RATES", num: "2", subtitle: "Yield curve and Treasury rates" },
  { key: "inflation", label: "INFLATION", num: "3", subtitle: "CPI, PCE, and price components" },
  { key: "growth", label: "GROWTH", num: "4", subtitle: "GDP, ISM PMI, output indicators" },
  { key: "labor", label: "LABOR", num: "5", subtitle: "Unemployment, payrolls, claims, layoffs" },
  { key: "global", label: "GLOBAL", num: "6", subtitle: "World indices, FX, commodities, yields" },
  { key: "risk", label: "RISK", num: "7", subtitle: "VIX, credit spreads, financial stress" },
  { key: "sentiment", label: "SENTIMENT", num: "8", subtitle: "Fear & Greed, sectors, Reddit buzz" },
  { key: "capitol", label: "CAPITOL", num: "9", subtitle: "Politician trading — STOCK Act filings" },
  { key: "realestate", label: "REAL ESTATE", num: "0", subtitle: "Housing prices, supply, construction" },
  { key: "auctions", label: "BOND AUCTIONS", num: "", subtitle: "Treasury auction results" },
  { key: "ipo", label: "IPOs", num: "", subtitle: "Pipeline and pricing calendar" },
  { key: "altindex", label: "ALT INDEX", num: "", subtitle: "Alternative data — vice, travel, shipping" },
];

export default function TabBar({ active, onSelect }) {
  return (
    <nav
      role="tablist"
      aria-label="Dashboard sections"
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
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
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
                color: isActive ? "hsl(142,70%,55%)" : "hsl(0,0%,85%)",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                transition: "color 0.15s, background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.target.style.color = "hsla(142,70%,55%,0.7)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.target.style.color = "hsl(0,0%,85%)";
              }}
              onMouseDown={(e) => {
                e.target.style.background = "hsla(142,70%,55%,0.08)";
              }}
              onMouseUp={(e) => {
                e.target.style.background = "none";
              }}
            >
              <span style={{ color: "hsl(0,0%,55%)", marginRight: 4, fontSize: 10 }}>{tab.num}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
      <span className="keys-hint" style={{ fontSize: 10, color: "hsl(220,10%,52%)", letterSpacing: "0.05em" }}>
        KEYS 1-9/0 · ⌘K SEARCH · [ ] NAV
      </span>
    </nav>
  );
}

export { TABS };
