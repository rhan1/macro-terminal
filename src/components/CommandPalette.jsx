import { useState, useEffect, useRef, useMemo } from "react";

function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - (t.length - q.length);
  if (t.includes(q)) return 500 - t.indexOf(q);
  let qi = 0;
  let lastMatchIdx = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (lastMatchIdx >= 0) gaps += i - lastMatchIdx - 1;
      lastMatchIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return -1;
  return 100 - gaps;
}

function highlight(text, query) {
  if (!query) return text;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const out = [];
  let qi = 0;
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && t[i] === q[qi]) {
      if (buf) { out.push(<span key={`p${i}`}>{buf}</span>); buf = ""; }
      out.push(<span key={`m${i}`} style={{ color: "hsl(185,70%,65%)", fontWeight: 600 }}>{text[i]}</span>);
      qi++;
    } else {
      buf += text[i];
    }
  }
  if (buf) out.push(<span key="tail">{buf}</span>);
  return out;
}

export default function CommandPalette({ tabs, open, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query) {
      return tabs.map((t, i) => ({ tab: t, score: -i, idx: i }));
    }
    return tabs
      .map((t, i) => {
        const labelScore = fuzzyScore(query, t.label);
        const subScore = t.subtitle ? fuzzyScore(query, t.subtitle) * 0.4 : -1;
        const score = Math.max(labelScore, subScore);
        return { tab: t, score, idx: i };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [query, tabs]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[activeIdx];
      if (picked) { onSelect(picked.tab.key); onClose(); }
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "hsla(220,20%,4%,0.85)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 92vw)",
          background: "hsl(220,20%,8%)",
          border: "1px solid hsl(220,15%,20%)",
          boxShadow: "0 8px 48px hsla(185,70%,55%,0.15)",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to tab…"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid hsl(220,15%,18%)",
            color: "hsl(220,15%,88%)",
            fontFamily: "inherit",
            fontSize: 13,
            padding: "14px 16px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {results.length === 0 && (
            <div style={{ padding: "14px 16px", color: "hsl(220,10%,52%)", fontSize: 11 }}>
              No matching tabs
            </div>
          )}
          {results.map((r, i) => {
            const isActive = i === activeIdx;
            return (
              <div
                key={r.tab.key}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => { onSelect(r.tab.key); onClose(); }}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  background: isActive ? "hsla(185,70%,55%,0.1)" : "transparent",
                  borderLeft: isActive ? "2px solid hsl(185,70%,55%)" : "2px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{
                  minWidth: 18,
                  fontSize: 10,
                  color: "hsl(220,10%,45%)",
                  textAlign: "center",
                }}>
                  {r.tab.num || "—"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: isActive ? "hsl(185,70%,65%)" : "hsl(220,15%,85%)",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}>
                    {highlight(r.tab.label, query)}
                  </div>
                  {r.tab.subtitle && (
                    <div style={{
                      color: "hsl(220,10%,52%)",
                      fontSize: 10,
                      marginTop: 2,
                    }}>
                      {r.tab.subtitle}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          padding: "8px 16px",
          borderTop: "1px solid hsl(220,15%,18%)",
          fontSize: 9,
          color: "hsl(220,10%,45%)",
          display: "flex",
          gap: 16,
          letterSpacing: "0.04em",
        }}>
          <span>↑↓ NAV</span>
          <span>⏎ OPEN</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}
