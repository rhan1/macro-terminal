import { useState, useEffect, useRef } from "react";
import { fetchSeries } from "../services/fred";

export function useFredData(seriesMap) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const key = JSON.stringify(
    Object.fromEntries(Object.entries(seriesMap).map(([k, v]) => [k, v.id]))
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData({});

    const entries = Object.entries(seriesMap);
    let settled = 0;

    entries.forEach(([k, opts], i) => {
      setTimeout(() => {
        fetchSeries(opts.id, opts)
          .then((result) => {
            if (!cancelled) {
              setData((prev) => ({ ...prev, [k]: result }));
            }
          })
          .catch(() => {})
          .finally(() => {
            settled++;
            if (settled === entries.length && !cancelled) {
              setLoading(false);
            }
          });
      }, i * 50);
    });

    return () => { cancelled = true; };
  }, [key]);

  return { data, loading, error };
}
