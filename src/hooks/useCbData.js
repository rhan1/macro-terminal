import { useState, useEffect } from "react";

const cache = { data: null, ts: 0 };
const TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useCbData() {
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
    fetch("/api/cb")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => {
        if (d.error) {
          setError(d.error);
          setData(null);
        } else {
          cache.data = d;
          cache.ts = Date.now();
          setData(d);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to load CB data");
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}
