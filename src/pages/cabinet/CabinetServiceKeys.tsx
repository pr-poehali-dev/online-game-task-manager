import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../../backend/func2url.json';

const SERVICE_KEYS_URL = (func2url as Record<string, string>)['service-keys'];
const TOKEN_KEY = 'era_auth_token';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

// Первое применение раздела — SSH-доступ к VPS игрового лаунчера, используется backend'ом при
// заливке файлов из дерева патчей (см. LAUNCHER_UPLOAD.md, backend/patches/index.py,
// action=launcher_upload). Раздел универсальный (key/value), но пока показывает только эту
// группу — остальные ключи можно добавить сюда же по мере необходимости.
const FIELDS: { key: string; label: string; placeholder: string; secret: boolean; hint?: string }[] = [
  { key: 'LAUNCHER_SSH_HOST', label: 'Хост VPS лаунчера', placeholder: 'forge.la2era.com', secret: false },
  { key: 'LAUNCHER_SSH_PORT', label: 'Порт SSH', placeholder: '22', secret: false },
  { key: 'LAUNCHER_SSH_USER', label: 'Логин SSH', placeholder: 'l2upload', secret: false },
  { key: 'LAUNCHER_SSH_PASSWORD', label: 'Пароль SSH', placeholder: '••••••••', secret: true },
];

// Раздел "Логи" — один SFTP-хост обслуживает логи ВСЕХ серверов проекта (пути до конкретных
// серверов задаются отдельно, в форме сервера — см. CabinetServers.tsx, поле "Директория логов").
// См. backend/logs/RESEARCH_NOTES.md за контекстом задачи.
const LOGS_FIELDS: { key: string; label: string; placeholder: string; secret: boolean }[] = [
  { key: 'LOGS_SFTP_HOST', label: 'Хост VPS с логами', placeholder: 'logs.la2era.com', secret: false },
  { key: 'LOGS_SFTP_PORT', label: 'Порт SFTP', placeholder: '22', secret: false },
  { key: 'LOGS_SFTP_USER', label: 'Логин SFTP', placeholder: 'l2logs', secret: false },
  { key: 'LOGS_SFTP_PASSWORD', label: 'Пароль SFTP', placeholder: '••••••••', secret: true },
];

const ALL_FIELDS = [...FIELDS, ...LOGS_FIELDS];

interface FieldValue {
  value: string;
  isSet: boolean;
}

export default function CabinetServiceKeys() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(SERVICE_KEYS_URL, { method: 'GET', headers: authHeaders() });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, FieldValue> = {};
        for (const item of data.items || []) map[item.key] = { value: item.value, isSet: item.isSet };
        setValues(map);
        const initialForm: Record<string, string> = {};
        for (const f of ALL_FIELDS) {
          if (!f.secret) initialForm[f.key] = map[f.key]?.value || '';
        }
        setForm(initialForm);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    const entries = ALL_FIELDS.map((f) => ({ key: f.key, value: form[f.key] ?? '', isSecret: f.secret }));
    const res = await fetch(SERVICE_KEYS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'save', entries }),
    });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось сохранить — попробуйте ещё раз');
      return;
    }
    setSaved(true);
    load();
  }

  if (loading) {
    return (
      <div className="max-w-2xl flex justify-center py-10">
        <Icon name="Loader2" size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold mb-1">Служебные ключи</h1>
        <p className="text-sm text-muted-foreground mb-6">Прочая служебная информация для работы проекта.</p>
        <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-3">
          <Icon name="Lock" size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">Эта настройка доступна только владельцу проекта.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Служебные ключи</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Прочая служебная информация для работы проекта.
      </p>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon name="Server" size={13} />
          SSH-доступ к VPS лаунчера
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Используется при заливке файлов из дерева патчей на сервер игрового лаунчера
        </p>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-muted-foreground mb-1.5">{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.secret && values[f.key]?.isSet ? values[f.key].value : f.placeholder}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
            {f.secret && values[f.key]?.isSet && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Icon name="CheckCircle2" size={11} className="text-primary" />
                Текущее значение сохранено — оставьте поле пустым, чтобы не менять
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4 mt-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon name="FileText" size={13} />
          SFTP-доступ к логам
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Один хост обслуживает логи всех серверов — путь до логов конкретного сервера задаётся в разделе «Серверы»
        </p>
        {LOGS_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-muted-foreground mb-1.5">{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.secret && values[f.key]?.isSet ? values[f.key].value : f.placeholder}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
            {f.secret && values[f.key]?.isSet && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Icon name="CheckCircle2" size={11} className="text-primary" />
                Текущее значение сохранено — оставьте поле пустым, чтобы не менять
              </p>
            )}
          </div>
        ))}

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <Icon name="AlertCircle" size={13} />
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-xs text-primary flex items-center gap-1.5">
            <Icon name="CheckCircle2" size={13} />
            Сохранено
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
          >
            {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}