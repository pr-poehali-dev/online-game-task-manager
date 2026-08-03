import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog, catalogAuthFetch } from '@/lib/catalog';
import type { CategoryItem } from '@/lib/catalog';

// Та же палитра, что используется для аватаров участников команды и серверов (см. AVATAR_HUES в
// src/pages/index/sharedConstants.ts / CabinetServers.tsx), чтобы не заводить ещё одну отдельную
// палитру в проекте.
const COLOR_PALETTE = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%', '25 80% 55%', '215 15% 55%'];

// Готовый набор популярных lucide-иконок на выбор — по требованию пользователя (проще и быстрее,
// чем свободный ввод точного английского названия иконки).
const ICON_OPTIONS = [
  'Globe', 'MonitorDown', 'Gamepad2', 'MessagesSquare', 'Megaphone', 'Database', 'Code2',
  'ScrollText', 'PartyPopper', 'Tag', 'Server', 'ShieldCheck', 'Rocket', 'Wrench', 'Sparkles',
  'Newspaper', 'Users', 'Palette', 'MoreHorizontal',
];

interface CategoryFormState {
  label: string;
  icon: string;
  color: string;
}

const EMPTY_FORM: CategoryFormState = { label: '', icon: ICON_OPTIONS[0], color: COLOR_PALETTE[0] };

function CategoryForm({ initial, saving, error, onCancel, onSave }: {
  initial: CategoryFormState;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (form: CategoryFormState) => void;
}) {
  const [form, setForm] = useState<CategoryFormState>(initial);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Название категории</label>
        <input
          autoFocus
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder="Например: Веб"
          className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
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

export default function CabinetCategories() {
  const { categories, loading, reload } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function createCategory(form: CategoryFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({ action: 'create_category', label: form.label.trim(), icon: form.icon, color: form.color });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось создать категорию — попробуйте ещё раз');
      return;
    }
    setAdding(false);
    reload();
  }

  async function updateCategory(id: string, form: CategoryFormState) {
    setSaving(true);
    setError('');
    const res = await catalogAuthFetch({ action: 'update_category', id, label: form.label.trim(), icon: form.icon, color: form.color });
    setSaving(false);
    if (!res.ok) {
      setError('Не удалось сохранить изменения — попробуйте ещё раз');
      return;
    }
    setEditingId(null);
    reload();
  }

  async function deleteCategory(id: string) {
    setDeletingId(id);
    const res = await catalogAuthFetch({ action: 'delete_category', id });
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.ok) reload();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Категории</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Icon name="Plus" size={15} />
            Добавить категорию
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">Общий список категорий для задач и статей базы знаний.</p>

      {adding && (
        <div className="mb-4">
          <CategoryForm
            initial={EMPTY_FORM}
            saving={saving}
            error={error}
            onCancel={() => { setAdding(false); setError(''); }}
            onSave={createCategory}
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Icon name="Loader2" size={22} className="animate-spin text-primary" />
        </div>
      ) : categories.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Категорий пока нет — добавьте первую.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c: CategoryItem) =>
            editingId === c.id ? (
              <div key={c.id}>
                <CategoryForm
                  initial={{ label: c.label, icon: c.icon, color: c.color }}
                  saving={saving}
                  error={error}
                  onCancel={() => { setEditingId(null); setError(''); }}
                  onSave={(form) => updateCategory(c.id, form)}
                />
              </div>
            ) : (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `hsl(${c.color} / 0.15)`, color: `hsl(${c.color})` }}
                >
                  <Icon name={c.icon} size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{c.label}</span>
                </div>
                <button
                  onClick={() => { setEditingId(c.id); setError(''); }}
                  title="Редактировать"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <Icon name="Pencil" size={14} />
                </button>
                {/* Категорию "other" (Прочее) нельзя удалить — на неё автоматически переезжают
                    задачи/статьи удалённых категорий (см. backend/catalog/index.py,
                    delete_category, ошибка cant_delete_default). */}
                {c.id !== 'other' && (
                  confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => deleteCategory(c.id)}
                        disabled={deletingId === c.id}
                        className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-50"
                      >
                        {deletingId === c.id ? <Icon name="Loader2" size={12} className="animate-spin" /> : 'Да'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Нет
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      title="Удалить категорию"
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
