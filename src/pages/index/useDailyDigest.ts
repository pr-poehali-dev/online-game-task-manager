import { useCallback, useEffect, useState } from 'react';
import { DIGEST_URL, authHeaders } from './shared';

export interface DigestCounts {
  patchnotes: number;
  newTasks: number;
  closedTasks: number;
  newIdeas: number;
  newArticles: number;
}

export interface DigestPrefs {
  patchnotesEnabled: boolean;
  newTasksEnabled: boolean;
  closedTasksEnabled: boolean;
  newIdeasEnabled: boolean;
  newArticlesEnabled: boolean;
}

// useDailyDigest — блокирующий попап "дайджест дня" (см. DailyDigestModal.tsx), показывается один
// раз за календарные сутки при заходе в задачник, пока сотрудник не нажмёт «Ознакомлен» — работать
// дальше в приложении нельзя (см. backend/digest/index.py, action=check/acknowledge). Проверка
// делается ОДИН раз при монтировании (сразу после успешной авторизации, см. использование в
// Index.tsx) — не polling, дайджест не может появиться среди рабочего дня сам по себе.
export function useDailyDigest(enabled: boolean) {
  const [shouldShow, setShouldShow] = useState(false);
  const [counts, setCounts] = useState<DigestCounts | null>(null);
  const [prefs, setPrefs] = useState<DigestPrefs | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const check = useCallback(async () => {
    if (!DIGEST_URL) return;
    try {
      const res = await fetch(DIGEST_URL, { method: 'GET', headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setShouldShow(!!data.shouldShow);
      setCounts(data.counts || null);
      setPrefs(data.prefs || null);
      setPeriodStart(data.periodStart || null);
      setPeriodEnd(data.periodEnd || null);
    } catch {
      /* ignore — попап дайджеста не должен ронять весь заход в приложение при сбое сети */
    }
  }, []);

  useEffect(() => {
    if (enabled) check();
  }, [enabled, check]);

  const acknowledge = useCallback(async () => {
    setAcknowledging(true);
    try {
      await fetch(DIGEST_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'acknowledge' }),
      });
      setShouldShow(false);
    } catch {
      /* ignore */
    } finally {
      setAcknowledging(false);
    }
  }, []);

  return { shouldShow, counts, prefs, periodStart, periodEnd, acknowledging, acknowledge };
}