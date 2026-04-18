import { useEffect, useMemo, useRef, useState } from "react";
import worldMapSvg from "../assets/world-map/world-map.min.svg?raw";

const AMBER  = "hsl(45,90%,55%)";
const CYAN   = "hsl(185,70%,55%)";
const GREEN  = "hsl(142,70%,55%)";
const RED    = "hsl(0,72%,55%)";
const DIM    = "hsl(220,10%,52%)";
const MUTED  = "hsl(220,15%,18%)";
const BORDER = "hsl(220,15%,14%)";

const MODE_STORAGE_KEY = "macro-heatmap-mode";

export default function EscortHeatMap({ countries, totalWorldwide }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  // Sort/color mode: "density" (listings / 100k pop) or "total" (raw count).
  // Density normalizes away country size and is the default.
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "density";
    const stored = window.localStorage?.getItem(MODE_STORAGE_KEY);
    return stored === "total" ? "total" : "density";
  });
  useEffect(() => {
    window.localStorage?.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  // valueOf(c) is the scalar the palette and ranking are keyed off.
  // In density mode we fall back to 0 (not null) for countries missing a
  // population reference so they bucket into the bottom tier instead of
  // disappearing entirely.
  const valueOf = (c) =>
    mode === "density" ? (c.countPer100kRef ?? 0) : (c.total ?? 0);

  // 10-band decile palette — deep navy → teal → cyan → green → lime → amber →
  // hot red. Doubling the band count (was 5) lets 129 countries spread across
  // ~13 per band instead of ~26, making adjacent-rank countries visually
  // distinguishable. Hue sweep is continuous; lightness rises as values do.
  const TIER_COLORS = useMemo(
    () => [
      "hsla(225, 45%, 20%, 0.85)",   // T0 — bottom decile (deep navy)
      "hsla(215, 55%, 28%, 0.85)",   // T1
      "hsla(205, 60%, 36%, 0.88)",   // T2
      "hsla(195, 70%, 44%, 0.9)",    // T3
      "hsla(185, 75%, 52%, 0.92)",   // T4 — mid cyan
      "hsla(165, 70%, 52%, 0.94)",   // T5 — teal-green
      "hsla(135, 70%, 54%, 0.95)",   // T6 — green
      "hsla(90,  75%, 56%, 0.97)",   // T7 — lime
      "hsla(45,  92%, 58%, 1.0)",    // T8 — amber
      "hsla(15,  92%, 58%, 1.0)",    // T9 — top decile (hot red)
    ],
    []
  );
  const TIER_COUNT = TIER_COLORS.length;

  // Rank countries by the active metric, then assign each to a decile (0..9).
  // Pure rank-based bucketing so the top tier stands out even when values
  // are log-compressed against the long tail of small-country listings.
  const { fillCss, tierByIso, tierLabels } = useMemo(() => {
    const ranked = [...countries]
      .filter((c) => c.iso)
      .sort((a, b) => valueOf(b) - valueOf(a));
    const n = ranked.length;
    const tiers = new Map();
    const tierBounds = Array.from({ length: TIER_COUNT }, () => []);
    ranked.forEach((c, idx) => {
      const tier = (TIER_COUNT - 1) - Math.min(TIER_COUNT - 1, Math.floor((idx / n) * TIER_COUNT));
      tiers.set(c.iso, tier);
      tierBounds[tier].push(valueOf(c));
    });

    const rules = ranked
      .map((c) => {
        const fill = TIER_COLORS[tiers.get(c.iso)];
        return `.escort-heatmap svg path[id="${c.iso}"],
.escort-heatmap svg g[id="${c.iso}"] path { fill: ${fill} !important; cursor: pointer; }`;
      })
      .join("\n");

    // Legend formatter: density shows 1 decimal, totals are integer.
    const fmtBound = (v) =>
      mode === "density" ? v.toFixed(1) : Math.round(v).toLocaleString();
    const labels = tierBounds.map((vals) => {
      if (!vals.length) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return min === max ? fmtBound(min) : `${fmtBound(min)}–${fmtBound(max)}`;
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
  }, [countries, TIER_COLORS, mode]);

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

  // Leader in the currently-active metric, not just the prop sort order.
  const topCountry = useMemo(() => {
    const ranked = [...countries].filter((c) => c.iso).sort((a, b) => valueOf(b) - valueOf(a));
    return ranked[0] ?? null;
  }, [countries, mode]);

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

        {/* Mode toggle — TOTAL vs /100K population */}
        <div style={{ display: "flex", gap: 2, marginLeft: 10 }}>
          {[
            { key: "total",   label: "TOTAL" },
            { key: "density", label: "/100K" },
          ].map((opt) => {
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                style={{
                  background: active ? "hsla(185,70%,55%,0.15)" : "none",
                  border: active ? `1px solid hsla(185,70%,55%,0.4)` : "1px solid transparent",
                  color: active ? CYAN : DIM,
                  fontSize: 9,
                  fontFamily: "inherit",
                  padding: "2px 8px",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  fontWeight: active ? 600 : 400,
                  transition: "all 0.1s",
                }}
                title={opt.key === "density"
                  ? "Rank by listings per 100,000 population — normalizes country size"
                  : "Rank by raw listing count"}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

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
          {mode === "density" ? "Listings / 100K pop" : "Listings"}
        </span>
        {/* Continuous swatch strip — discrete tiers, no crowded per-band labels. */}
        <div
          style={{
            display: "flex",
            height: 10,
            borderRadius: 1,
            overflow: "hidden",
            width: 220,
          }}
        >
          {TIER_COLORS.map((color, i) => (
            <div key={i} style={{ flex: 1, background: color }} />
          ))}
        </div>

        {/* Endpoint labels — just min and max of the whole range. */}
        <span
          style={{
            fontSize: 9,
            color: DIM,
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
          }}
        >
          {(() => {
            const firstLabel = tierLabels.find((l) => l != null);
            const lastLabel = [...tierLabels].reverse().find((l) => l != null);
            // Pull the low end from firstLabel (bottom tier, smallest value)
            // and the high end from lastLabel (top tier, largest value).
            const low = firstLabel ? firstLabel.split("–")[0] : "—";
            const high = lastLabel
              ? (lastLabel.includes("–") ? lastLabel.split("–")[1] : lastLabel)
              : "—";
            return `${low}  →  ${high}`;
          })()}
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
            {mode === "density" && hover.countPer100kRef != null ? (
              <>
                {hover.countPer100kRef.toFixed(1)}{" "}
                <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>/ 100K pop</span>
              </>
            ) : (
              <>
                {hover.total.toLocaleString()}{" "}
                <span style={{ fontSize: 9, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>listings</span>
              </>
            )}
          </div>
          {/* Secondary metric — the one NOT selected as the primary view */}
          {mode === "density" ? (
            <div style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
              {hover.total.toLocaleString()} total listings
            </div>
          ) : (
            hover.countPer100kRef != null && (
              <div style={{ fontSize: 10, color: DIM, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                {hover.countPer100kRef.toFixed(1)} / 100K pop
              </div>
            )
          )}
          {hover.delta != null && (
            <div
              style={{
                fontSize: 10,
                color: hover.delta > 0 ? GREEN : hover.delta < 0 ? RED : DIM,
                fontFamily: '"JetBrains Mono", monospace',
                fontVariantNumeric: "tabular-nums",
                marginTop: 4,
              }}
            >
              {hover.delta > 0 ? "▲" : hover.delta < 0 ? "▼" : "–"}{" "}
              {hover.delta > 0 ? "+" : ""}{hover.delta.toLocaleString()}
              {hover.deltaPct != null && (
                <span style={{ color: DIM }}>{" "}({hover.deltaPct > 0 ? "+" : ""}{hover.deltaPct}%)</span>
              )}
              <span style={{ color: DIM, marginLeft: 6, fontSize: 9 }}>vs last refresh</span>
            </div>
          )}
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
