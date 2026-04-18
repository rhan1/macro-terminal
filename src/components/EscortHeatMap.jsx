import { useEffect, useMemo, useRef, useState } from "react";
import worldMapSvg from "../assets/world-map/world-map.min.svg?raw";

const AMBER  = "hsl(45,90%,55%)";
const CYAN   = "hsl(185,70%,55%)";
const DIM    = "hsl(220,10%,52%)";
const MUTED  = "hsl(220,15%,18%)";
const BORDER = "hsl(220,15%,14%)";

export default function EscortHeatMap({ countries, totalWorldwide }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const maxTotal = countries.reduce((m, c) => Math.max(m, c.total), 0);

  // Quintile-ranked palette — cold (deep teal) → hot (amber) with distinct steps
  // so different listing volumes are visually separable. Pure alpha scaling
  // makes everything look the same cyan; discrete hue bands fix that.
  const TIER_COLORS = useMemo(
    () => [
      "hsla(200, 55%, 28%, 0.85)",   // T0  — lowest quintile (deep teal)
      "hsla(195, 65%, 42%, 0.9)",    // T1
      "hsla(185, 75%, 55%, 0.95)",   // T2  — mid cyan
      "hsla(90,  70%, 55%, 0.95)",   // T3  — cyan-to-lime
      "hsla(35,  95%, 60%, 1.0)",    // T4  — top quintile (hot amber)
    ],
    []
  );

  // Rank countries by total, then assign each to a quintile (0..4).
  // Pure rank-based (not value-based) bucketing so the top-5 stand out
  // even when values are log-compressed.
  const { fillCss, tierByIso, tierLabels } = useMemo(() => {
    const ranked = [...countries]
      .filter((c) => c.iso)
      .sort((a, b) => b.total - a.total);
    const n = ranked.length;
    const tiers = new Map();
    const tierBounds = [[], [], [], [], []];
    ranked.forEach((c, idx) => {
      // Top 20% → tier 4, next 20% → tier 3, ... bottom 20% → tier 0
      const tier = 4 - Math.min(4, Math.floor((idx / n) * 5));
      tiers.set(c.iso, tier);
      tierBounds[tier].push(c.total);
    });

    const rules = ranked
      .map((c) => {
        const fill = TIER_COLORS[tiers.get(c.iso)];
        return `.escort-heatmap svg path[id="${c.iso}"],
.escort-heatmap svg g[id="${c.iso}"] path { fill: ${fill} !important; cursor: pointer; }`;
      })
      .join("\n");

    // Build legend labels — range for each tier
    const labels = tierBounds.map((vals) => {
      if (!vals.length) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return min === max ? `${min}` : `${min}–${max}`;
    });

    return {
      fillCss: `
.escort-heatmap svg { width: 100%; height: auto; display: block; }
.escort-heatmap svg path { fill: ${MUTED}; stroke: ${BORDER}; stroke-width: 0.35; transition: fill 0.15s ease, stroke 0.1s ease; }
${rules}
`,
      tierByIso: tiers,
      tierLabels: labels,
    };
  }, [countries, TIER_COLORS]);

  const byIso = useMemo(
    () => new Map(countries.filter((c) => c.iso).map((c) => [c.iso, c])),
    [countries]
  );

  // One-time SVG cleanup + scroll listener to hide the tooltip when the
  // page scrolls without a mouse move (otherwise the fixed tooltip can
  // float detached from the map).
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const svg = root.querySelector("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    }

    const clearHover = () => setHover(null);
    const scrollableMain = document.querySelector("main");
    window.addEventListener("scroll", clearHover, true);
    scrollableMain?.addEventListener("scroll", clearHover, true);
    window.addEventListener("blur", clearHover);

    return () => {
      window.removeEventListener("scroll", clearHover, true);
      scrollableMain?.removeEventListener("scroll", clearHover, true);
      window.removeEventListener("blur", clearHover);
    };
  }, []);

  // React-delegated hover: single handler on the wrapper uses event.target
  // to find the country under the cursor. Avoids per-path listener setup
  // that was silently failing after re-renders.
  const handleMove = (e) => {
    const el = e.target.closest("[id]");
    if (!el) {
      setHover(null);
      return;
    }
    const iso = el.id;
    const entry = byIso.get(iso);
    if (!entry) {
      setHover(null);
      return;
    }
    setHover({ ...entry, x: e.clientX, y: e.clientY });
  };

  const topCountry = countries[0];

  return (
    <div className="panel escort-heatmap" style={{ padding: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: fillCss }} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: CYAN,
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {totalWorldwide != null ? totalWorldwide.toLocaleString() : "—"}
        </span>
        <span style={{ fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Worldwide listings
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {countries.length} countries tracked
          {topCountry && (
            <>
              <span style={{ color: BORDER, margin: "0 8px" }}>·</span>
              <span style={{ color: AMBER }}>{topCountry.country}</span> leads
            </>
          )}
        </span>
      </div>

      <div
        ref={wrapRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{ position: "relative", width: "100%" }}
        dangerouslySetInnerHTML={{ __html: worldMapSvg }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Listings
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {TIER_COLORS.map((color, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <div style={{ width: 36, height: 10, background: color, borderRadius: 1 }} />
              <span
                style={{
                  fontSize: 8,
                  color: DIM,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tierLabels[i] ?? "—"}
              </span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 9, color: DIM, fontFamily: '"JetBrains Mono", monospace' }}>
          low → high
        </span>
        <span style={{ marginLeft: "auto", fontSize: 8, color: DIM }}>
          Map: CC BY-SA 3.0 · Al MacDonald / F. Lekschas
        </span>
      </div>

      {hover && (
        <div
          style={{
            position: "fixed",
            left: Math.min(hover.x + 14, window.innerWidth - 260),
            top: Math.min(hover.y + 14, window.innerHeight - 200),
            background: "hsl(220,15%,8%)",
            border: `1px solid ${CYAN}55`,
            padding: "8px 10px",
            minWidth: 180,
            maxWidth: 240,
            pointerEvents: "none",
            zIndex: 100,
            fontFamily: "inherit",
            boxShadow: "0 4px 18px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ fontSize: 9, color: CYAN, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {hover.country}
          </div>
          <div
            style={{
              fontSize: 16,
              color: "var(--color-term-text)",
              fontFamily: '"JetBrains Mono", monospace',
              fontVariantNumeric: "tabular-nums",
              marginTop: 3,
              lineHeight: 1,
            }}
          >
            {hover.total.toLocaleString()}{" "}
            <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>listings</span>
          </div>
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: `1px solid ${BORDER}`,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {hover.cities.map((c) => (
              <div
                key={c.city}
                style={{
                  fontSize: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 8,
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--color-term-text)" }}>{c.city}</span>
                <span style={{ color: CYAN, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums" }}>
                  {c.count.toLocaleString()}
                </span>
                <span style={{ color: DIM, fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums" }}>
                  {c.countPer100k != null ? `${c.countPer100k.toFixed(1)}/100k` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
