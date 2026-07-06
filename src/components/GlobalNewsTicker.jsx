const AMBER = "hsl(45,90%,55%)";
const DIM = "hsl(220,10%,52%)";
const BORDER = "hsl(220,15%,14%)";

const SOURCE_COLORS = {
  BBC: "hsl(0,70%,60%)",
  Guardian: "hsl(210,70%,60%)",
  "Al Jazeera": "hsl(142,50%,55%)",
  NYT: "hsl(220,15%,85%)",
  FT: "hsl(20,50%,70%)",
};

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffH = (Date.now() - d.getTime()) / 36e5;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m`;
  if (diffH < 24) return `${Math.round(diffH)}h`;
  const days = Math.round(diffH / 24);
  return `${days}d`;
}

export default function GlobalNewsTicker({ items, sources, errors }) {
  const visible = (items || []).slice(0, 15);
  const downSources = errors ? Object.keys(errors) : [];
  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          World Headlines
        </span>
        <span style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          {(sources || []).join(" · ") || "loading"}
        </span>
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 11, color: DIM }}>
          {downSources.length ? `News feeds unreachable (${downSources.length}/5 failing).` : "Loading headlines…"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {downSources.length > 0 && (
            <div style={{ fontSize: 9, color: DIM, opacity: 0.7, padding: "0 0 6px" }}>
              source unavailable: {downSources.join(", ")}
            </div>
          )}
          {visible.map((it, i) => {
            const sourceColor = SOURCE_COLORS[it.source] || AMBER;
            return (
              <a
                key={`${it.url || i}-${i}`}
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "baseline",
                  padding: "6px 0",
                  borderBottom: i < visible.length - 1 ? `1px solid ${BORDER}` : "none",
                  fontSize: 11,
                  color: "var(--color-term-text)",
                  textDecoration: "none",
                  lineHeight: 1.35,
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "hsla(220,15%,14%,0.4)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 9, color: sourceColor, letterSpacing: "0.06em", fontWeight: 600, minWidth: 60 }}>
                  {it.source?.toUpperCase() || "?"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title}
                </span>
                <span style={{ fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>
                  {relTime(it.publishedAt)}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
