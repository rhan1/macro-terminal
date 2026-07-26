import { useMemo, useRef, useState } from "react";
import { useEconomies } from "../hooks/useEconomies";

const GREEN = "hsl(142,70%,55%)";
const RED = "hsl(0,72%,55%)";
const DIM = "hsl(220,10%,52%)";
const DIM2 = "hsl(220,10%,38%)";
const BORDER = "hsl(220,15%,14%)";
const SURFACE2 = "hsl(220,18%,9%)";
const CYAN = "hsl(185,70%,55%)";

const BLOCS = [
  ["OECD", "OECD"],
  ["ASEAN", "ASEAN"],
  ["AFRICA", "AFRICA — pockets with data"],
  ["MAJORS", "OTHER MAJORS / BRICS+"],
];

// Rolling 6-quarter axis ending at the current quarter (data lags trail off honestly).
function buildAxis() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  const y = now.getUTCFullYear();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    let qq = q - i, yy = y;
    while (qq < 1) { qq += 4; yy -= 1; }
    out.push(`${yy}-Q${qq}`);
  }
  return out;
}

const MET = {
  gdp: { lbl: "GDP", capQ: 1.6, capY: 7, kind: "value" },
  unemp: { lbl: "UNEMP", cap: 0.7, kind: "delta", inv: true },
  trade: { lbl: "EXPORTS", cap: 14, kind: "value" },
};

function basisOf(cc, m) {
  const s = (cc.src || {})[m] || "";
  return s.includes("YoY") ? "Y" : "Q";
}

function capFor(cc, m) {
  const cfg = MET[m];
  return m === "gdp" ? (basisOf(cc, m) === "Y" ? cfg.capY : cfg.capQ) : cfg.cap;
}

// Diverging red↔neutral↔green by signed intensity; inv flips (rising unemployment = red).
function colorFor(v, cap, inv) {
  if (v == null || Number.isNaN(v)) return null;
  let t = Math.max(-1, Math.min(1, v / cap));
  if (inv) t = -t;
  const a = Math.abs(t);
  if (a < 0.06) return "hsl(220,18%,14%)";
  const L = 46 - 10 * a;
  return t > 0
    ? `hsla(142,68%,${L}%,${0.35 + 0.65 * a})`
    : `hsla(0,72%,${L + 4}%,${0.35 + 0.65 * a})`;
}

function metricVals(cc, m, axis) {
  const cfg = MET[m];
  const arr = cc[m] || [];
  const byP = {};
  arr.forEach((o) => { byP[o.p] = o; });
  return axis.map((p) => {
    const cur = byP[p];
    if (!cur) return { p, raw: null, heat: null };
    if (cfg.kind === "delta") {
      const idx = arr.findIndex((x) => x.p === p);
      const prev = idx > 0 ? arr[idx - 1].v : null;
      return { p, raw: cur.v, heat: prev == null ? 0 : cur.v - prev, usd: cur.usd };
    }
    return { p, raw: cur.v, heat: cur.v, usd: cur.usd };
  });
}

function momentum(cc) {
  const arr = cc.gdp || [];
  if (!arr.length) return null;
  const last = arr[arr.length - 1].v;
  return basisOf(cc, "gdp") === "Y" ? last / 4 : last;
}

function tipContent(cc, m, o) {
  const cfg = MET[m];
  const basis =
    m === "gdp"
      ? basisOf(cc, m) === "Y" ? "YoY, not seas. adj." : "QoQ, seas. adj."
      : m === "trade" ? "exports YoY (qtr sum of monthly USD)" : "rate, %";
  const extra = m === "trade" && o.usd ? ` · $${o.usd}B` : "";
  const dtxt =
    cfg.kind === "delta" && o.raw != null && o.heat != null
      ? ` (Δ ${o.heat >= 0 ? "+" : ""}${o.heat.toFixed(1)}pt)`
      : "";
  const val =
    o.raw == null
      ? "no data published"
      : `${o.raw.toFixed(m === "gdp" ? 2 : 1)}${m === "unemp" ? "" : "%"}${dtxt}${extra}`;
  return { title: `${cc.name} — ${cfg.lbl} ${o.p}`, val, src: `${basis}${(cc.src || {})[m] ? " · " + cc.src[m] : ""}` };
}

// Fallback chip when a metric has nothing on the 6-quarter axis:
// stale series → "as of" chip colored by its latest value;
// no quarterly series at all → "A" chip from IMF WEO annual (never faked
// into the quarterly cells — annual data stays visually distinct).
function fallbackChip(cc, m, axis) {
  const cfg = MET[m];
  const arr = cc[m] || [];
  const onAxis = arr.some((o) => o.p >= axis[0]);
  if (onAxis) return null;
  if (arr.length > 0) {
    const last = arr[arr.length - 1];
    const prev = arr.length > 1 ? arr[arr.length - 2].v : null;
    const heat = cfg.kind === "delta" ? (prev == null ? 0 : last.v - prev) : last.v;
    return {
      label: last.p.slice(2).replace("-", ""),
      color: colorFor(heat, capFor(cc, m), cfg.inv),
      tip: {
        title: `${cc.name} — ${cfg.lbl} (stale)`,
        val: `${last.v.toFixed(1)}${m === "unemp" ? "" : "%"} · as of ${last.p}`,
        src: (cc.src || {})[m] || "",
      },
    };
  }
  const weo = cc.weo?.[m === "trade" ? null : m];
  if (weo?.length) {
    const actual = [...weo].reverse().find((o) => !o.forecast) || weo[0];
    const fcast = weo.find((o) => o.forecast);
    return {
      label: "A",
      color: colorFor(m === "unemp" ? 0 : actual.v, m === "unemp" ? 1 : MET.gdp.capY, false),
      tip: {
        title: `${cc.name} — ${cfg.lbl} (annual, IMF WEO)`,
        val: `${actual.p}: ${actual.v.toFixed(1)}%${fcast ? ` · ${fcast.p}F: ${fcast.v.toFixed(1)}%` : ""}`,
        src: "no quarterly data published · IMF WEO annual",
      },
    };
  }
  return null;
}

function Strip({ cc, m, axis, onTip }) {
  const cap = capFor(cc, m);
  const vals = metricVals(cc, m, axis);
  const chip = fallbackChip(cc, m, axis);
  return (
    <span style={{ display: "inline-flex", gap: 1.5, alignItems: "center" }}>
      {vals.map((o, i) => {
        const col = o.raw == null ? null : colorFor(o.heat, cap, MET[m].inv);
        return (
          <span
            key={o.p}
            onMouseMove={(e) => onTip(e, tipContent(cc, m, vals[i]))}
            onMouseLeave={() => onTip(null)}
            style={{
              width: 9, height: 9, borderRadius: 2, display: "inline-block",
              background: col || SURFACE2,
              outline: col ? "none" : `1px solid ${BORDER}`,
              outlineOffset: -1,
            }}
          />
        );
      })}
      <span
        onMouseMove={chip ? (e) => onTip(e, chip.tip) : undefined}
        onMouseLeave={chip ? () => onTip(null) : undefined}
        style={{
          minWidth: 22, height: 11, borderRadius: 2, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 7.5, letterSpacing: "0.02em",
          color: chip ? "hsl(220,15%,78%)" : "transparent",
          background: chip ? (chip.color || SURFACE2) : "transparent",
          marginLeft: 2,
        }}
      >
        {chip ? chip.label : ""}
      </span>
    </span>
  );
}

function CountryRow({ cc, axis, onTip }) {
  const lbl = { color: DIM2, fontSize: 8.5, width: 10, textAlign: "center", flexShrink: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "1.5px 0" }}>
      <span style={{ width: 104, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "hsl(220,15%,82%)" }}>
        {cc.name}
      </span>
      <span style={lbl}>G</span>
      <Strip cc={cc} m="gdp" axis={axis} onTip={onTip} />
      <span style={lbl}>U</span>
      <Strip cc={cc} m="unemp" axis={axis} onTip={onTip} />
      <span style={lbl}>X</span>
      <Strip cc={cc} m="trade" axis={axis} onTip={onTip} />
    </div>
  );
}

export default function Economies() {
  const { data, loading, error } = useEconomies();
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);
  const axis = useMemo(buildAxis, []);

  const onTip = (e, content) => {
    if (!e || !content) { setTip(null); return; }
    const x = Math.min(e.clientX + 14, window.innerWidth - 280);
    const y = Math.min(e.clientY + 14, window.innerHeight - 90);
    setTip({ x, y, ...content });
  };

  const blocs = useMemo(() => {
    if (!data?.countries) return [];
    const entries = Object.entries(data.countries);
    return BLOCS.map(([key, label]) => {
      const rows = entries
        .filter(([, cc]) => cc.bloc === key)
        .map(([iso, cc]) => ({ iso, cc }))
        .sort((a, b) => {
          const ma = momentum(a.cc), mb = momentum(b.cc);
          if (ma == null && mb == null) return a.cc.name.localeCompare(b.cc.name);
          if (ma == null) return 1;
          if (mb == null) return -1;
          return mb - ma;
        });
      return { key, label, rows };
    });
  }, [data]);

  if (loading) return <div className="loading-bar" style={{ height: 3 }} />;
  if (error || data?.error === "not-yet-seeded" || !data?.countries) {
    return (
      <div className="panel" style={{ padding: 16, color: DIM }}>
        ECONOMIES — {data?.error === "not-yet-seeded" ? "data not yet seeded (cron pending)" : `unavailable (${error || "no data"})`}
      </div>
    );
  }

  const cov = data.meta?.coverage;
  const legendSw = (bg) => ({ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: bg, marginRight: 5, verticalAlign: -1 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 11 }}>
      <div className="panel" style={{ padding: "7px 12px", display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", color: DIM }}>
        <span><span style={legendSw("hsl(142,68%,42%)")} />improving / growth</span>
        <span><span style={legendSw("hsl(220,18%,14%)")} />flat</span>
        <span><span style={legendSw("hsl(0,72%,46%)")} />deteriorating / contraction</span>
        <span><span style={{ ...legendSw(SURFACE2), outline: `1px solid ${BORDER}`, outlineOffset: -1 }} />no data published</span>
        <span style={{ color: DIM2, fontSize: 9 }}>
          G=gdp U=unemployment X=exports · last 6 quarters, oldest→newest · unemployment colored by change (rising = red) · sorted by GDP momentum · end chips: A = annual-only (IMF WEO) · 24Q4-style = stale, as-of that quarter
        </span>
        {cov && (
          <span style={{ color: DIM2, fontSize: 9 }}>
            coverage {cov.gdp}/{cov.total ?? 66} gdp · {cov.unemp}/{cov.total ?? 66} unemp · {cov.trade}/{cov.total ?? 66} exports
            {data.meta?.fetchedAt ? ` · as of ${String(data.meta.fetchedAt).slice(0, 10)}` : ""}
          </span>
        )}
      </div>

      {blocs.map(({ key, label, rows }) => (
        <section key={key} className="panel" style={{ padding: "10px 14px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "2px 0 8px" }}>
            <b style={{ fontSize: 11, letterSpacing: "0.16em", color: CYAN }}>{label}</b>
            <span style={{ color: DIM2 }}>{rows.length} economies</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(430px, 1fr))", gap: "3px 26px", minWidth: 430 }}>
              {rows.map(({ iso, cc }) => (
                <CountryRow key={iso} cc={cc} axis={axis} onTip={onTip} />
              ))}
            </div>
          </div>
        </section>
      ))}

      {tip && (
        <div
          ref={tipRef}
          style={{
            position: "fixed", left: tip.x, top: tip.y, pointerEvents: "none", zIndex: 10,
            background: "hsla(220,20%,6%,0.97)", border: "1px solid hsl(220,15%,22%)",
            borderRadius: 5, padding: "7px 10px", fontSize: 10.5, maxWidth: 260,
            boxShadow: "0 6px 24px hsla(220,40%,2%,0.6)",
          }}
        >
          <div style={{ color: "hsl(142,70%,70%)", marginBottom: 2 }}>{tip.title}</div>
          <div>{tip.val}</div>
          <div style={{ color: DIM }}>{tip.src}</div>
        </div>
      )}
    </div>
  );
}
