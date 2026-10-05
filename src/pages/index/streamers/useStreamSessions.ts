import { useCallback, useEffect, useRef, useState } from 'react';
import { STREAMERS_URL, authHeaders } from '../shared';
import { ERROR_TEXTS } from './streamersTypes';
import type { StreamSession, SessionSortKey, SessionFilters } from './streamersTypes';

export function useStreamSessions(active: boolean) {
  const [filters, setFilters] = useState<SessionFilters>({ streamerId: '', dateFrom: '', dateTo: '' });
  const [sort, setSort] = useState<SessionSortKey>('started');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState<StreamSession[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await fetch(STREAMERS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'sessions',
          streamerId: filters.streamerId ? Number(filters.streamerId) : null,
          dateFrom: filters.dateFrom || null,
          dateTo: filters.dateTo || null,
          sort,
          dir,
          page,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (id !== requestId.current) return;
      if (!res.ok) {
        setError(data.message || ERROR_TEXTS[data.error || ''] || 'Не удалось загрузить историю эфиров');
        return;
      }
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
      setPageSize(data.pageSize || 25);
      setError('');
    } catch {
      if (id === requestId.current) setError('Не удалось загрузить историю эфиров');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters, sort, dir, page]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const changeFilters = useCallback((patch: Partial<SessionFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const toggleSort = useCallback((key: SessionSortKey) => {
    setPage(1);
    if (key === sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(key);
    setDir(key === 'streamer' ? 'asc' : 'desc');
  }, [sort]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { filters, changeFilters, sort, dir, toggleSort, page, setPage, totalPages, total, sessions, loading, error, reload: load };
}
