import { useState, useEffect } from "react";

const cache = { data: null, ts: 0 };
const TTL = 5 * 60 * 1000; // 5 min

export function useMarketData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (cache.data && Date.now() - cache.ts < TTL) {
      setData(cache.data);
      setLoading(false);
      return;
    }

    fetch("/api/market?symbols=SPY,QQQ,TLT,GLD,USO,HYG,%5EVIX")
      .then((r) => r.json())
      .then((d) => {
        cache.data = d;
        cache.ts = Date.now();
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { data, loading };
}
