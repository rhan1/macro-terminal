import { useState, useEffect } from "react";

const cache = { data: null, ts: 0 };
const TTL = 60 * 60 * 1000; // 1 hour — matches the cron cadence

export function useOverviewNarrative() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (cache.data && Date.now() - cache.ts < TTL) {
      setData(cache.data);
      setLoading(false);
      return;
    }

    fetch("/api/overview-narrative")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error && d.paragraph) {
          cache.data = d;
          cache.ts = Date.now();
        }
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { data, loading };
}
