import { useCallback, useEffect, useRef, useState } from 'react';
import { STREAMERS_URL, authHeaders } from '../shared';
import { ERROR_TEXTS } from './streamersTypes';
import type { Streamer, CollectorHealth, DefaultRule } from './streamersTypes';

const REFRESH_MS = 30000;

function errorMessage(data: { error?: string; message?: string }, fallback: string): string {
  return data.message || ERROR_TEXTS[data.error || ''] || fallback;
}

async function call(body: Record<string, unknown>) {
  const res = await fetch(STREAMERS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function useStreamers(active: boolean) {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [health, setHealth] = useState<CollectorHealth | null>(null);
  const [defaultRule, setDefaultRule] = useState<DefaultRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [list, h, rules] = await Promise.all([
        call({ action: 'list' }),
        call({ action: 'health' }),
        call({ action: 'rules_get' }),
      ]);
      if (!list.ok) {
        setError(errorMessage(list.data, 'Не удалось загрузить список стримеров'));
        return;
      }
      setStreamers(list.data.streamers || []);
      if (h.ok) setHealth(h.data);
      if (rules.ok) setDefaultRule(rules.data.default || null);
      setError('');
      loadedOnce.current = true;
    } catch {
      if (!loadedOnce.current) setError('Не удалось загрузить список стримеров');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const add = useCallback(async (url: string, note: string): Promise<string | null> => {
    const { ok, data } = await call({ action: 'add', url, note });
    if (!ok) return errorMessage(data, 'Не удалось добавить стримера');
    await load();
    return null;
  }, [load]);

  const update = useCallback(async (id: number, patch: Record<string, unknown>): Promise<string | null> => {
    const { ok, data } = await call({ action: 'update', id, ...patch });
    if (!ok) return errorMessage(data, 'Не удалось сохранить изменения');
    const updated: Streamer | undefined = data.streamer;
    if (updated) setStreamers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated, live: s.live } : s)));
    return null;
  }, []);

  const remove = useCallback(async (id: number): Promise<string | null> => {
    const { ok, data } = await call({ action: 'delete', id });
    if (!ok) return errorMessage(data, 'Не удалось удалить стримера');
    setStreamers((prev) => prev.filter((s) => s.id !== id));
    return null;
  }, []);

  return { streamers, health, defaultRule, loading, error, reload: load, add, update, remove };
}
