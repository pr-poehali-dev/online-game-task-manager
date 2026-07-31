import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog, catalogAuthFetch } from '@/lib/catalog';
import type { ServerItem } from '@/lib/catalog';

// Палитра для быстрого выбора цвета сервера — та же, что используется для аватаров участников
// команды (см. AVATAR_HUES в src/pages/index/sharedConstants.ts), чтобы визуально не заводить
// ещё одну отдельную палитру в проекте.
const COLOR_PALETTE = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%', '25 80% 55%', '215 15% 55%'];

type ProtocolId = 'c4' | 'hf';

const PROTOCOL_OPTIONS: { id: ProtocolId; label: string; hint: string }[] = [
  { id: 'hf', label: 'HF (High Five)', hint: 'Основная ddf-схема — используется для большинства серверов' },
  { id: 'c4', label: 'C4 (Chronicle 4)', hint: 'Отдельная упрощённая ddf-схема для клиента Chronicle 4' },
];

interface ServerFormState {
  label: string;
  color: string;
  protocol: ProtocolId;
  description: string;
}

const EMPTY_FORM: ServerFormState = { label: '', color: COLOR_PALETTE[0], protocol: 'hf', description: '' };

function ServerForm({ initial, saving, error, onCancel, onSave }: {
  initial: ServerFormState;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (form: ServerFormState) => void;
}) {
  const [form, setForm] = useState<ServerFormState>(initial);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Название сервера</label>
        <input
          autoFocus
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder="Например: HF new"
          className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Протокол</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROTOCOL_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, protocol: p.id }))}
              className={`text-left rounded-lg border p-3 transition-colors ${
                form.protocol === p.id ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-secondary/40'
              }`}
            >
              <div className={`text-sm font-medium ${form.protocol === p.id ? 'text-primary' : 'text-foreground'}`}>{p.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          От протокола зависит ddf-схема при редактировании файлов в разделе «Патчи»
        </p>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Цвет</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, color: c }))}
              title={`hsl(${c})`}
              className={`h-8 w-8 rounded-full shrink-0 transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110' : 'hover:scale-105'}`}
              style={{ background: `hsl(${c})` }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Описание (необязательно)</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          rows={3}
          placeholder={'Открыт / Рейты, особенности...'}
          className="w-full resize-none rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Настройки лаунчера — заглушка, будет доработана отдельным этапом (см. требования
          пользователя): адреса xml/папок быстрой и полной загрузки. */}
      <div className="rounded-lg border border-dashed border-border p-3 opacity-60">
        <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
          <Icon name="UploadCloud" size={13} />
          Настройки лаунчера
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">скоро</span>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div>Адрес xml файла быстрой загрузки</div>
          <div>Адрес xml файла полной загрузки</div>
          <div>Адрес папки с файлами быстрой загрузки</div>
          <div>Адрес папки с файлами полной загрузки</div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.label.trim()}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
        >
          {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

export default function CabinetServers() {
  const { servers, loading, reload } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function createServer(form: ServerFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({ action: 'create_server', label: form.label.trim(), color: form.color, protocol: form.protocol, description: form.description.trim() });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось создать сервер — попробуйте ещё раз');
      return;
    }
    setAdding(false);
    reload();
  }

  async function updateServer(id: string, form: ServerFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({ action: 'update_server', id, label: form.label.trim(), color: form.color, protocol: form.protocol, description: form.description.trim() });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось сохранить изменения — попробуйте ещё раз');
      return;
    }
    setEditingId(null);
    reload();
  }

  async function deleteServer(id: string) {
    setDeletingId(id);
    const res = await catalogAuthFetch({ action: 'delete_server', id });
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.ok) reload();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Серверы</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Icon name="Plus" size={15} />
            Добавить сервер
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">Список серверов проекта, доступных в задачах, патчах и патчноутах.</p>

      {adding && (
        <div className="mb-4">
          <ServerForm
            initial={EMPTY_FORM}
            saving={saving}
            error={error}
            onCancel={() => { setAdding(false); setError(''); }}
            onSave={createServer}
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Icon name="Loader2" size={22} className="animate-spin text-primary" />
        </div>
      ) : servers.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Серверов пока нет — добавьте первый.</p>
      ) : (
        <div className="space-y-2">
          {servers.map((s: ServerItem) =>
            editingId === s.id ? (
              <div key={s.id}>
                <ServerForm
                  initial={{ label: s.label, color: s.color, protocol: (s.protocol as ProtocolId) ?? 'hf', description: s.description ?? '' }}
                  saving={saving}
                  error={error}
                  onCancel={() => { setEditingId(null); setError(''); }}
                  onSave={(form) => updateServer(s.id, form)}
                />
              </div>
            ) : (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: `hsl(${s.color})` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{s.label}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                      {s.protocol === 'c4' ? 'C4' : 'HF'}
                    </span>
                  </div>
                  {s.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{s.description}</div>}
                </div>
                <button
                  onClick={() => { setEditingId(s.id); setError(''); }}
                  title="Редактировать"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <Icon name="Pencil" size={14} />
                </button>
                {confirmDeleteId === s.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => deleteServer(s.id)}
                      disabled={deletingId === s.id}
                      className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-50"
                    >
                      {deletingId === s.id ? <Icon name="Loader2" size={12} className="animate-spin" /> : 'Да'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(s.id)}
                    title="Удалить сервер"
                    disabled={servers.length <= 1}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
