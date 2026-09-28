import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import func2url from '../../../backend/func2url.json';

const DIGEST_URL = (func2url as Record<string, string>).digest;
const TOKEN_KEY = 'era_auth_token';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

interface DigestPrefs {
  patchnotesEnabled: boolean;
  newTasksEnabled: boolean;
  closedTasksEnabled: boolean;
  newIdeasEnabled: boolean;
  newArticlesEnabled: boolean;
}

const ROWS: { key: keyof DigestPrefs; label: string }[] = [
  { key: 'patchnotesEnabled', label: 'Новые записи в патчноутах' },
  { key: 'newTasksEnabled', label: 'Новые задачи, назначенные вам' },
  { key: 'closedTasksEnabled', label: 'Задачи, закрытые командой' },
  { key: 'newIdeasEnabled', label: 'Новые идеи' },
  { key: 'newArticlesEnabled', label: 'Новые статьи в базе знаний' },
];

// DigestPrefsSection — какие из 5 блоков ежедневного дайджеста показывать сотруднику (см.
// DailyDigestModal.tsx, backend/digest/index.py). Тот же паттерн переключателей, что у "Уведомления
// в приложении" выше в этом же файле — отдельный компонент только чтобы не раздувать сам
// CabinetProfile.tsx лишним состоянием/запросами.
export default function DigestPrefsSection() {
  const [prefs, setPrefs] = useState<DigestPrefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!DIGEST_URL) return;
    fetch(DIGEST_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_prefs' }) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.prefs) setPrefs(data.prefs); })
      .catch(() => {});
  }, []);

  async function toggle(key: keyof DigestPrefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(key);
    try {
      const res = await fetch(DIGEST_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'set_prefs', prefs: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPrefs(prefs);
      toast.error('Не удалось сохранить настройку');
    } finally {
      setSaving(null);
    }
  }

  if (!prefs) return null;

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold mb-1">Дайджест дня</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Какие блоки показывать в ежедневном попапе со сводкой событий при входе в задачник.
      </p>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm">{label}</span>
            <Switch
              checked={prefs[key]}
              disabled={saving === key}
              onCheckedChange={(v) => toggle(key, v)}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
