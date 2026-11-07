import { useEffect, useState } from 'react';
import { api } from './api';

// person_id -> display name, shared across the app so each id is fetched once.
const cache = new Map();

export default function useDisplayNames(personIds) {
  const [, rerender] = useState(0);
  const key = [...new Set(personIds)].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const missing = key.split(',').filter((id) => id && !cache.has(id));
    if (missing.length === 0) return undefined;
    Promise.all(missing.map(async (id) => {
      try { cache.set(id, (await api.userProfile(id)).display_name); } catch { cache.set(id, null); }
    })).then(() => { if (!cancelled) rerender((n) => n + 1); });
    return () => { cancelled = true; };
  }, [key]);

  // Falls back to a short id while loading, or if the profile cannot be read.
  return (id) => cache.get(id) || `User ${id.slice(0, 8)}`;
}
