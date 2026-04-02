import { useState, useEffect } from 'react';
import type { DashboardData } from '../types';

export function useData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for embedded data first
    if ((window as any).DASHBOARD_DATA) {
      setData((window as any).DASHBOARD_DATA);
      setLoading(false);
    }

    // Connect to SSE for live updates
    const apiBase = import.meta.env.DEV ? 'http://localhost:3456' : '';
    const evtSource = new EventSource(`${apiBase}/events`);

    evtSource.onmessage = (e) => {
      try {
        const newData = JSON.parse(e.data);
        setData(newData);
        setLoading(false);
        setError(null);
      } catch (err) {
        setError('Failed to parse data');
      }
    };

    evtSource.onerror = () => {
      // Try fetching directly
      fetch(`${apiBase}/api/data`)
        .then(res => res.json())
        .then(newData => {
          setData(newData);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to connect to server');
          setLoading(false);
        });
    };

    return () => {
      evtSource.close();
    };
  }, []);

  const refresh = async () => {
    const apiBase = import.meta.env.DEV ? 'http://localhost:3456' : '';
    try {
      await fetch(`${apiBase}/api/refresh`);
    } catch {}
  };

  return { data, loading, error, refresh };
}
