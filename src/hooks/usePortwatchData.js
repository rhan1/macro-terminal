import { useEffect, useState } from "react";

const cache = { data: null, ts: 0 };
const TTL = 6 * 60 * 60 * 1000;

export function usePortwatchData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache.data && Date.now() - cache.ts < TTL) {
      setData(cache.data);
      setLoading(false);
      return;
    }

    setError(null);
    fetch("/api/portwatch")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          cache.data = d;
          cache.ts = Date.now();
          setData(d);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to load Portwatch data");
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}
