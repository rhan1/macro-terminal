import { useState, useEffect } from "react";
import { fetchMultiple } from "../services/fred";

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
    fetchMultiple(seriesMap)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [key]);

  return { data, loading, error };
}
