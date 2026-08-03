import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../../backend/func2url.json';

const STORAGE_CONFIG_URL = (func2url as Record<string, string>)['storage-config'];
const TOKEN_KEY = 'era_auth_token';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

// Только эти ключи редактируются здесь — должны совпадать с MANAGED_KEYS в
// backend/storage-config/index.py.
const FIELDS: { key: string; label: string; placeholder: string; secret: boolean; hint?: string }[] = [
  { key: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID', placeholder: 'ВАШ_КЛЮЧ', secret: true },
  { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', placeholder: 'ВАШ_СЕКРЕТ', secret: true },
  { key: 'S3_ENDPOINT', label: 'Внутренний адрес MinIO', placeholder: 'http://127.0.0.1:9000', secret: false, hint: 'Адрес, по которому backend обращается к MinIO (обычно localhost на том же сервере)' },
  { key: 'S3_BUCKET', label: 'Название бакета', placeholder: 'files', secret: false },
  { key: 'S3_PUBLIC_URL', label: 'Публичный адрес файлов', placeholder: 'https://ваш-домен.ру/files', secret: false, hint: 'По этому адресу отдаются загруженные картинки и вложения пользователям' },
  { key: 'CDN_BASE_URL', label: 'Адрес CDN (необязательно)', placeholder: 'https://cdn.ваш-домен.ру', secret: false, hint: 'Если перед хранилищем настроен CDN — используется вместо публичного адреса выше' },
];

interface FieldValue {
  value: string;
  isSet: boolean;
}

export default function CabinetStorage() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(STORAGE_CONFIG_URL, { method: 'GET', headers: authHeaders() });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAvailable(data.available);
        if (data.available) {
          setValues(data.values || {});
          const initialForm: Record<string, string> = {};
          for (const f of FIELDS) {
            if (!f.secret) initialForm[f.key] = data.values?.[f.key]?.value || '';
          }
          setForm(initialForm);
        }
      } else {
        setAvailable(false);
      }
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    const payload: Record<string, string> = { ...form };
    const res = await fetch(STORAGE_CONFIG_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
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
        <h1 className="text-xl font-semibold mb-1">Хранилище (MinIO)</h1>
        <p className="text-sm text-muted-foreground mb-6">Адреса и ключи для файлового хранилища.</p>
        <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-3">
          <Icon name="Lock" size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            Эта настройка доступна только владельцу проекта.
          </div>
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold mb-1">Хранилище (MinIO)</h1>
        <p className="text-sm text-muted-foreground mb-6">Адреса и ключи для файлового хранилища.</p>
        <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-3">
          <Icon name="Info" size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            Эта настройка доступна только на вашем собственном сервере (после переноса проекта по
            инструкции в <code className="text-xs px-1 py-0.5 rounded bg-secondary">deploy/README.md</code>).
            На превью-окружении poehali.dev хранилище настраивается через раздел секретов платформы.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Хранилище (MinIO)</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Адреса и ключи для файлового хранилища на вашем сервере. После сохранения backend
        перезапустится автоматически в течение нескольких секунд.
      </p>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
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
            {f.hint && <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>}
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
            Сохранено. Backend перезапустится автоматически.
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