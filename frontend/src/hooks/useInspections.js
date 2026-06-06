import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export function useInspections(pollMs = 12000) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/inspections/');
      setRows(data);
      setError(null);
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.response?.data || e?.message || String(e);
      setError({ message: msg, status: e?.response?.status });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!pollMs) return undefined;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { rows, error, loading, reload: load };
}
