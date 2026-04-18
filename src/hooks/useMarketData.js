import { useState, useEffect, useCallback } from "react";

const quoteCache = { data: null, ts: 0 };
const chartCaches = {};
const QUOTE_TTL = 30 * 1000; // 30 sec
const CHART_TTL = 5 * 60 * 1000; // 5 min
const REFRESH_INTERVAL = 30 * 1000; // auto-refresh quotes every 30s

function getChartCache(range) {
  if (!chartCaches[range]) chartCaches[range] = { data: null, ts: 0 };
  return chartCaches[range];
}

export function useMarketData() {
  const [data, setData] = useState(quoteCache.data);
  const [spyChart, setSpyChart] = useState(null);
  const [chartRange, setChartRange] = useState("1y");
  const [loading, setLoading] = useState(!quoteCache.data);
  const [lastUpdated, setLastUpdated] = useState(quoteCache.ts || null);

  const loadChart = useCallback(async (range) => {
    const cache = getChartCache(range);
    const now = Date.now();
    if (cache.data && now - cache.ts < CHART_TTL) {
      setSpyChart(cache.data);
      setChartRange(range);
      return;
    }
    try {
      const interval = range === "5y" ? "1wk" : "1d";
      const resp = await fetch(`/api/market?chart=SPY&range=${range}&interval=${interval}`);
      const d = await resp.json();
      cache.data = d;
      cache.ts = Date.now();
      setSpyChart(d);
      setChartRange(range);
    } catch {}
  }, []);

  const load = useCallback(async (isMount) => {
    const now = Date.now();
    const fetches = [];

    if (!quoteCache.data || now - quoteCache.ts >= QUOTE_TTL) {
      fetches.push(
        fetch("/api/market?symbols=SPY,QQQ,TLT,GLD,USO,HYG,%5EVIX,UNG,CPER,FXE,FXY,FXB,BTC-USD")
          .then((r) => r.json())
          .then((d) => { quoteCache.data = d; quoteCache.ts = Date.now(); })
          .catch(() => {})
      );
    }

    if (fetches.length) await Promise.all(fetches);

    setData(quoteCache.data);
    setLastUpdated(quoteCache.ts);
    if (isMount) setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
    loadChart("1y");
    const id = setInterval(() => load(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [load, loadChart]);

  return { data, spyChart, chartRange, loadChart, loading, lastUpdated };
}
