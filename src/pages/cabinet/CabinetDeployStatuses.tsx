import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog, catalogAuthFetch } from '@/lib/catalog';
import type { DeployStatusItem } from '@/lib/catalog';

// Та же палитра, что у категорий и серверов (см. CabinetCategories.tsx) — отдельную заводить не
// нужно, оформление статусов должно быть в одном ключе с остальными справочниками.
const COLOR_PALETTE = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%', '25 80% 55%', '215 15% 55%'];

// Иконки, уместные именно для стадий работы над задачей.
const ICON_OPTIONS = [
  'Circle', 'Minus', 'Hammer', 'Code2', 'FlaskConical', 'CircleCheck', 'CircleX', 'Ban',
  'Rocket', 'Clock', 'Eye', 'Bug', 'Wrench', 'ShieldCheck', 'Sparkles', 'PauseCircle',
];

// Колонки доски, к которым можно привязать свой статус. «Готово» отсутствует намеренно:
// единственный статус в ней — системный «Можно заливать на лайв», на нём держатся бейдж
// «Требуется залить в лаунчер» и уведомления, поэтому её состав не редактируется.
// «На удержании» тоже нет: она не привязана к статусам — отложить можно задачу в любом статусе,
// и при переносе туда статус сохраняется.
const COLUMN_OPTIONS: { id: string; title: string; hint: string }[] = [
  { id: 'todo', title: 'К выполнению', hint: 'Задача ещё не в работе' },
  { id: 'progress', title: 'В работе', hint: 'Задача в процессе' },
];

interface StatusFormState {
  label: string;
  icon: string;
  color: string;
  column: string;
}

const EMPTY_FORM: StatusFormState = { label: '', icon: ICON_OPTIONS[0], color: COLOR_PALETTE[0], column: 'todo' };

function StatusForm({ initial, saving, error, lockColumn, onCancel, onSave }: {
  initial: StatusFormState;
  saving: boolean;
  error: string;
  // У системных статусов колонка не меняется — на ней держится логика доски.
  lockColumn: boolean;
  onCancel: () => void;
  onSave: (form: StatusFormState) => void;
}) {
  const [form, setForm] = useState<StatusFormState>(initial);

  return (
    <div className="rounded-xl border border-border bg-card panel-raised p-4 space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Название статуса</label>
        <input
          autoFocus
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder="Например: Ждёт ревью"
          className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Колонка доски</label>
        {lockColumn ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Icon name="Lock" size={12} />
            У системного статуса колонка не меняется
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {COLUMN_OPTIONS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, column: col.id }))}
                title={col.hint}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  form.column === col.id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary/40'
                }`}
              >
                {col.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Иконка</label>
        <div className="flex flex-wrap gap-2">
          {ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, icon }))}
              title={icon}
              className={`h-9 w-9 rounded-lg flex items-center justify-center border transition-colors ${
                form.icon === icon ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              <Icon name={icon} size={16} />
            </button>
          ))}
        </div>
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

      {/* Предпросмотр: статус в интерфейсе выглядит именно так */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Вид на карточке:</span>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
          style={{
            background: `hsl(${form.color} / 0.12)`,
            color: `hsl(${form.color})`,
            borderColor: `hsl(${form.color} / 0.3)`,
          }}
        >
          <Icon name={form.icon} size={10} />
          {form.label.trim() || 'Название статуса'}
        </span>
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

export default function CabinetDeployStatuses() {
  const { deployStatuses, loading, reload } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function columnTitle(id: string) {
    if (id === 'done') return 'Готово';
    if (id === 'hold') return 'На удержании';
    return COLUMN_OPTIONS.find((c) => c.id === id)?.title ?? id;
  }

  async function createStatus(form: StatusFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({
      action: 'create_deploy_status',
      label: form.label.trim(), icon: form.icon, color: form.color, column: form.column,
    });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось создать статус — попробуйте ещё раз');
      return;
    }
    setAdding(false);
    reload();
  }

  async function updateStatus(id: string, form: StatusFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({
      action: 'update_deploy_status',
      id, label: form.label.trim(), icon: form.icon, color: form.color, column: form.column,
    });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось сохранить изменения — попробуйте ещё раз');
      return;
    }
    setEditingId(null);
    reload();
  }

  async function deleteStatus(id: string) {
    setDeletingId(id);
    const res = await catalogAuthFetch({ action: 'delete_deploy_status', id });
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.ok) reload();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Статусы деплоя</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Icon name="Plus" size={15} />
            Добавить статус
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Стадии работы над задачей. Выбор статуса автоматически переносит задачу в соответствующую
        колонку доски. Два статуса — «Без статуса» и «Можно заливать на лайв» — системные: у них
        можно изменить оформление, но нельзя удалить или перенести в другую колонку.
      </p>

      {adding && (
        <div className="mb-4">
          <StatusForm
            initial={EMPTY_FORM}
            saving={saving}
            error={error}
            lockColumn={false}
            onCancel={() => { setAdding(false); setError(''); }}
            onSave={createStatus}
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Icon name="Loader2" size={22} className="animate-spin text-primary" />
        </div>
      ) : deployStatuses.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Статусов пока нет — добавьте первый.</p>
      ) : (
        <div className="space-y-2">
          {deployStatuses.map((d: DeployStatusItem) =>
            editingId === d.id ? (
              <div key={d.id}>
                <StatusForm
                  initial={{ label: d.label, icon: d.icon, color: d.color, column: d.column }}
                  saving={saving}
                  error={error}
                  lockColumn={d.isSystem}
                  onCancel={() => { setEditingId(null); setError(''); }}
                  onSave={(form) => updateStatus(d.id, form)}
                />
              </div>
            ) : (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-card panel-raised p-4">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `hsl(${d.color} / 0.15)`, color: `hsl(${d.color})` }}
                >
                  <Icon name={d.icon} size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{d.label}</span>
                    {d.isSystem && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
                        Системный
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Колонка: {columnTitle(d.column)}</span>
                </div>
                <button
                  onClick={() => { setEditingId(d.id); setError(''); }}
                  title="Редактировать"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <Icon name="Pencil" size={14} />
                </button>
                {/* Системные статусы не удаляются: на «Без статуса» переезжают задачи удалённых
                    статусов, а на «Можно заливать на лайв» завязана заливка в лаунчер. */}
                {!d.isSystem && (
                  confirmDeleteId === d.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => deleteStatus(d.id)}
                        disabled={deletingId === d.id}
                        className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-50"
                      >
                        {deletingId === d.id ? <Icon name="Loader2" size={12} className="animate-spin" /> : 'Да'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Нет
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(d.id)}
                      title="Удалить статус — задачи с ним станут «Без статуса»"
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  )
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
