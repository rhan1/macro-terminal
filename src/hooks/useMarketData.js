import { useState, useEffect, useCallback } from "react";

const quoteCache = { data: null, ts: 0 };
const chartCache = { data: null, ts: 0 };
const QUOTE_TTL = 30 * 1000; // 30 sec
const CHART_TTL = 5 * 60 * 1000; // 5 min (yearly chart doesn't change fast)
const REFRESH_INTERVAL = 30 * 1000; // auto-refresh quotes every 30s

export function useMarketData() {
  const [data, setData] = useState(quoteCache.data);
  const [spyChart, setSpyChart] = useState(chartCache.data);
  const [loading, setLoading] = useState(!quoteCache.data);
  const [lastUpdated, setLastUpdated] = useState(quoteCache.ts || null);

  const load = useCallback(async (isMount) => {
    const now = Date.now();
    const fetches = [];

    if (!quoteCache.data || now - quoteCache.ts >= QUOTE_TTL) {
      fetches.push(
        fetch("/api/market?symbols=SPY,QQQ,TLT,GLD,USO,HYG,%5EVIX")
          .then((r) => r.json())
          .then((d) => { quoteCache.data = d; quoteCache.ts = Date.now(); })
          .catch(() => {})
      );
    }

    if (!chartCache.data || now - chartCache.ts >= CHART_TTL) {
      fetches.push(
        fetch("/api/market?chart=SPY&range=1y&interval=1d")
          .then((r) => r.json())
          .then((d) => { chartCache.data = d; chartCache.ts = Date.now(); })
          .catch(() => {})
      );
    }

    if (fetches.length) await Promise.all(fetches);

    setData(quoteCache.data);
    setSpyChart(chartCache.data);
    setLastUpdated(quoteCache.ts);
    if (isMount) setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  return { data, spyChart, loading, lastUpdated };
}
