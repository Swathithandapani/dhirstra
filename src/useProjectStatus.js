import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:5000';

export function useProjectStatus() {
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/project-status`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(d => { map[d.file_path] = d; });
          setStatusMap(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Poll every 15 seconds so all dashboards stay in sync
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  return { statusMap, loading, reload: load };
}

export const STATUS_LABEL = {
  null:                    { label: 'Submitted',              color: '#9e9e9e' },
  'Pending':               { label: 'Pending Review',         color: '#1e88e5' },
  'Forwarded to Ministry': { label: 'Forwarded to Ministry',  color: '#7b1fa2' },
  'Nodal Rejected':        { label: 'Nodal Rejected',         color: '#e53935' },
  'approved':              { label: 'Ministry Approved',      color: '#2e7d32' },
  'rejected':              { label: 'Ministry Rejected',      color: '#b71c1c' },
};

export function getOverallStatus(ps) {
  if (!ps) return { label: 'Submitted', color: '#9e9e9e' };
  if (ps.ministry_decision === 'approved') return { label: 'Ministry Approved', color: '#2e7d32' };
  if (ps.ministry_decision === 'rejected') return { label: 'Ministry Rejected', color: '#b71c1c' };
  if (ps.nodal_status === 'Forwarded to Ministry') return { label: 'Forwarded to Ministry', color: '#7b1fa2' };
  if (ps.nodal_status === 'Nodal Rejected') return { label: 'Nodal Rejected', color: '#e53935' };
  return { label: ps.nodal_status || 'Pending Review', color: '#1e88e5' };
}
