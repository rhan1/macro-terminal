import { useState, useEffect } from "react";

export function useSentimentData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/sentiment")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          if (json.error) {
            setError(json.error);
          } else {
            setData(json);
          }
        }
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? "Failed to load sentiment data"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
