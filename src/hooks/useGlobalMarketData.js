import { useEffect, useState } from "react";
import worldIndices from "../data/worldIndices.json";
import { FX_PAIRS } from "../data/fxPairs";
import { COMMODITIES } from "../data/commoditiesList";

const ALL_SYMBOLS = [
  ...worldIndices.map((i) => i.symbol),
  ...FX_PAIRS.map((p) => p.yahoo),
  ...COMMODITIES.map((c) => c.yahoo),
];

const CHUNK_SIZE = 8;
const CHUNK_TIMEOUT_MS = 10000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchChunk(symbols) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), CHUNK_TIMEOUT_MS);
  try {
    const r = await fetch(`/api/market?symbols=${encodeURIComponent(symbols.join(","))}`, { signal: ctl.signal });
    if (!r.ok) return {};
    return await r.json();
  } catch {
    return {};
  } finally {
    clearTimeout(to);
  }
}

export function useGlobalMarketData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const groups = chunk(ALL_SYMBOLS, CHUNK_SIZE);
    Promise.allSettled(groups.map(fetchChunk))
      .then((results) => {
        if (cancelled) return;
        const merged = {};
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && typeof r.value === "object") {
            for (const [k, v] of Object.entries(r.value)) {
              merged[k] = v;
              // Yahoo strips a leading `^` from response keys, but our symbol
              // lists (e.g. ^GSPC, ^N225) still carry it. Alias both forms.
              if (!k.startsWith("^")) merged[`^${k}`] = v;
            }
          }
        }
        setData(merged);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
