import { useCallback, useEffect, useState } from 'react';
import { STREAMERS_URL, authHeaders } from '../shared';
import { ERROR_TEXTS } from './streamersTypes';
import type { Rule, MatchMode } from './streamersTypes';

async function call(body: Record<string, unknown>) {
  const res = await fetch(STREAMERS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function msg(data: { error?: string; message?: string }, fallback: string): string {
  return data.message || ERROR_TEXTS[data.error || ''] || fallback;
}

export function useStreamerRules(active: boolean, onChanged: () => void) {
  const [defaultRule, setDefaultRule] = useState<Rule | null>(null);
  const [own, setOwn] = useState<Record<number, Rule>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { ok, data } = await call({ action: 'rules_get' });
      if (!ok) {
        setError(msg(data, 'Не удалось загрузить правила'));
        return;
      }
      setDefaultRule(data.default || null);
      const map: Record<number, Rule> = {};
      for (const r of (data.perStreamer || []) as Rule[]) {
        if (r.streamerId != null) map[r.streamerId] = r;
      }
      setOwn(map);
      setError('');
    } catch {
      setError('Не удалось загрузить правила');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const save = useCallback(async (
    streamerId: number | null,
    keywords: string[],
    matchMode: MatchMode,
    base: Rule | null,
  ): Promise<string | null> => {
    const { ok, data } = await call({
      action: 'rules_set',
      streamerId,
      keywords,
      matchMode,
      checkTitle: base ? base.checkTitle : true,
      checkTags: base ? base.checkTags : false,
    });
    if (!ok) return msg(data, 'Не удалось сохранить правило');
    await load();
    onChanged();
    return null;
  }, [load, onChanged]);

  const reset = useCallback(async (streamerId: number): Promise<string | null> => {
    const { ok, data } = await call({ action: 'rules_reset', streamerId });
    if (!ok) return msg(data, 'Не удалось вернуть общее правило');
    await load();
    onChanged();
    return null;
  }, [load, onChanged]);

  return { defaultRule, own, loading, error, save, reset };
}
