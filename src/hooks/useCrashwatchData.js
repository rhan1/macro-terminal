import { useState, useEffect } from "react";

export function useCrashwatchData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crashwatch")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && !json.error) setData(json);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
