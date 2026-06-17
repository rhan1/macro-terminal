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
const VALID_MODES = ["total", "density", "mom"];

const BASE_SVG_CSS = `
.escort-heatmap svg { width: 100%; height: auto; display: block; }
.escort-heatmap svg path { fill: ${MUTED}; stroke: ${BORDER}; stroke-width: 0.35; transition: fill 0.15s ease, stroke 0.1s ease; }
`;

// Diverging palette for month-over-month change: red (decline) → grey (flat) →
// green (growth). Keyed off signed momPct, NOT rank — so colour means direction.
const MOM_FLAT = "hsla(220,12%,38%,0.85)";
function momColor(pct) {
  if (pct == null) return null;        // no history → leave default MUTED
  if (pct <= -10) return "hsla(0,78%,44%,0.96)";
  if (pct <= -3)  return "hsla(2,66%,52%,0.92)";
  if (pct < -0.5) return "hsla(10,52%,52%,0.88)";
  if (pct <= 0.5) return MOM_FLAT;     // ~flat
  if (pct < 3)    return "hsla(140,42%,46%,0.88)";
  if (pct < 10)   return "hsla(142,60%,48%,0.92)";
  return "hsla(145,78%,50%,0.96)";
}
const MOM_SWATCH = [
  "hsla(0,78%,44%,0.96)", "hsla(2,66%,52%,0.92)", "hsla(10,52%,52%,0.88)",
  MOM_FLAT,
  "hsla(140,42%,46%,0.88)", "hsla(142,60%,48%,0.92)", "hsla(145,78%,50%,0.96)",
];

const WIN_LABEL = { mom: "MoM", q3m: "3M", h6m: "6M", yoy: "YoY" };

// Tiny inline trend sparkline for the tooltip — green if the series ends above
// where it started, red otherwise.
function Sparkline({ points, width = 210, height = 32 }) {
  const vals = (points || []).map((p) => p.total);
  const n = vals.length;
  if (n < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals
    .map((v, i) => {
      const x = (i / (n - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const col = vals[n - 1] >= vals[0] ? "hsl(142,70%,55%)" : "hsl(0,72%,55%)";
  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function EscortHeatMap({ countries, totalWorldwide, worldMoMPct, changeWindow = "mom" }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  // Active change window for Δ mode (driven by the growth panel above). Falls
  // back to the legacy mom* fields when a country has no multi-window `chg`.
  const win = WIN_LABEL[changeWindow] ? changeWindow : "mom";
  const winLabel = WIN_LABEL[win];
  const chgPctOf = (c) => c.chg?.[win]?.pct ?? c.momPct ?? null;
  const chgDeltaOf = (c) => c.chg?.[win]?.delta ?? c.momDelta ?? null;
  const chgDaysOf = (c) => c.chg?.[win]?.windowDays ?? c.momWindowDays ?? null;

  // Sort/color mode: "density" (listings / 100k pop), "total" (raw count), or
  // "mom" (month-over-month change). Density normalizes country size; mom colours
  // by direction of change. Density is the default.
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "density";
    const stored = window.localStorage?.getItem(MODE_STORAGE_KEY);
    return VALID_MODES.includes(stored) ? stored : "density";
  });
  useEffect(() => {
    window.localStorage?.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  // valueOf(c) is the scalar the ranking is keyed off (used for the "leads"
  // callout and the rank-decile palette). In mom mode we rank by momPct so the
  // fastest grower surfaces; missing data sinks to the bottom.
  const valueOf = (c) =>
    mode === "density" ? (c.countPer100kRef ?? 0)
    : mode === "mom"   ? (chgPctOf(c) ?? -Infinity)
    : (c.total ?? 0);

  // 10-band decile palette for TOTAL / /100K — deep navy → teal → cyan → green →
  // lime → amber → hot red. (mom mode uses the diverging palette above instead.)
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

  const { fillCss, tierLabels } = useMemo(() => {
    const valid = [...countries].filter((c) => c.iso);

    // Δ mode: colour by signed change over the active window, not rank.
    if (mode === "mom") {
      const rules = valid
        .map((c) => {
          const fill = momColor(chgPctOf(c));
          if (!fill) return "";
          return `.escort-heatmap svg path[id="${c.iso}"],
.escort-heatmap svg g[id="${c.iso}"] path { fill: ${fill} !important; cursor: pointer; }`;
        })
        .filter(Boolean)
        .join("\n");
      return { fillCss: `${BASE_SVG_CSS}${rules}`, tierLabels: null };
    }

    // TOTAL / /100K: pure rank-based decile bucketing.
    const ranked = valid.sort((a, b) => valueOf(b) - valueOf(a));
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

    const fmtBound = (v) =>
      mode === "density" ? v.toFixed(1) : Math.round(v).toLocaleString();
    const labels = tierBounds.map((vals) => {
      if (!vals.length) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return min === max ? fmtBound(min) : `${fmtBound(min)}–${fmtBound(max)}`;
    });

    return { fillCss: `${BASE_SVG_CSS}${rules}`, tierLabels: labels };
  }, [countries, TIER_COLORS, mode, win]);

  const byIso = useMemo(
    () => new Map(countries.filter((c) => c.iso).map((c) => [c.iso, c])),
    [countries]
  );

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

  // Leader callout — in mom mode this is the fastest grower; otherwise the
  // top-ranked country in the active metric.
  const topCountry = useMemo(() => {
    const ranked = [...countries].filter((c) => c.iso).sort((a, b) => valueOf(b) - valueOf(a));
    return ranked[0] ?? null;
  }, [countries, mode, win]);

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
        {/* Worldwide MoM badge */}
        {worldMoMPct != null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: worldMoMPct > 0 ? GREEN : worldMoMPct < 0 ? RED : DIM,
              fontFamily: '"JetBrains Mono", monospace',
              fontVariantNumeric: "tabular-nums",
            }}
            title="Worldwide listings change vs ~1 month ago"
          >
            {worldMoMPct > 0 ? "▲" : worldMoMPct < 0 ? "▼" : "–"}{" "}
            {worldMoMPct > 0 ? "+" : ""}{worldMoMPct}%{" "}
            <span style={{ fontSize: 9, color: DIM, fontWeight: 400 }}>MoM</span>
          </span>
        )}

        {/* Mode toggle — TOTAL / /100K population / Δ month-over-month */}
        <div style={{ display: "flex", gap: 2, marginLeft: 10 }}>
          {[
            { key: "total",   label: "TOTAL",  title: "Rank by raw listing count" },
            { key: "density", label: "/100K",  title: "Rank by listings per 100,000 population — normalizes country size" },
            { key: "mom",     label: `Δ ${winLabel}`,  title: "Colour by change over the selected window — red = decline, green = growth" },
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
                title={opt.title}
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
              <span style={{ color: AMBER }}>{topCountry.country}</span>{" "}
              {mode === "mom" ? "fastest growth" : "leads"}
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
          {mode === "density" ? "Listings / 100K pop" : mode === "mom" ? `${winLabel} change` : "Listings"}
        </span>
        {/* Swatch strip — decile palette for level modes, diverging for mom. */}
        <div
          style={{
            display: "flex",
            height: 10,
            borderRadius: 1,
            overflow: "hidden",
            width: 220,
          }}
        >
          {(mode === "mom" ? MOM_SWATCH : TIER_COLORS).map((color, i) => (
            <div key={i} style={{ flex: 1, background: color }} />
          ))}
        </div>

        {/* Endpoint labels */}
        <span
          style={{
            fontSize: 9,
            color: DIM,
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
          }}
        >
          {mode === "mom"
            ? "decline  ←  flat  →  growth"
            : (() => {
                const firstLabel = tierLabels?.find((l) => l != null);
                const lastLabel = tierLabels ? [...tierLabels].reverse().find((l) => l != null) : null;
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
            top: Math.min(hover.y + 14, window.innerHeight - 220),
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
          {/* Change over the active window */}
          {(() => {
            const d = chgDeltaOf(hover), p = chgPctOf(hover), days = chgDaysOf(hover);
            if (d == null) return null;
            return (
              <div
                style={{
                  fontSize: 10,
                  color: d > 0 ? GREEN : d < 0 ? RED : DIM,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 4,
                }}
              >
                {d > 0 ? "▲" : d < 0 ? "▼" : "–"}{" "}
                {d > 0 ? "+" : ""}{d.toLocaleString()}
                {p != null && <span style={{ color: DIM }}>{" "}({p > 0 ? "+" : ""}{p}%)</span>}
                <span style={{ color: DIM, marginLeft: 6, fontSize: 9 }}>
                  {winLabel}{days ? ` · ~${days}d` : ""}
                </span>
              </div>
            );
          })()}
          {/* Trend sparkline */}
          {hover.trend?.length > 2 && (
            <div style={{ marginTop: 6 }}>
              <Sparkline points={hover.trend} />
            </div>
          )}
          {hover.cities.length > 0 && (
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
          )}
        </div>
      )}
    </div>
  );
}
