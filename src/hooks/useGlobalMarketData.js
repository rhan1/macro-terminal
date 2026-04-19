import { useEffect, useState } from "react";
import worldIndices from "../data/worldIndices.json";
import { FX_PAIRS } from "../data/fxPairs";
import { COMMODITIES } from "../data/commoditiesList";

const ALL_SYMBOLS = [
  ...worldIndices.map((i) => i.symbol),
  ...FX_PAIRS.map((p) => p.yahoo),
  ...COMMODITIES.map((c) => c.yahoo),
];

export function useGlobalMarketData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market?symbols=${encodeURIComponent(ALL_SYMBOLS.join(","))}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
