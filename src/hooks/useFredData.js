import { useState, useEffect } from "react";
import { fetchBatch } from "../services/fred";

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
    setError(null);

    fetchBatch(seriesMap)
      .then((result) => {
        if (!cancelled) {
          // result is { [key]: observations[] } for every fulfilled series.
          // Any series the server could not fetch is simply absent — it will
          // render "—" in the UI instead of crashing or silently dropping
          // everything else.
          setData(result);
        }
      })
      .catch((err) => {
        // Only reached when the batch request itself hard-fails (network down,
        // server misconfigured, etc.) — not when individual series fail.
        if (!cancelled) {
          setError(err?.message ?? "Failed to load FRED data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
