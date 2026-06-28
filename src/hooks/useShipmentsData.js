import { useEffect, useState } from "react";

export function useShipmentsData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/shipments")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err?.message ?? "Failed to load shipments data"); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
