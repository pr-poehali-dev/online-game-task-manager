import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { PROMPT_TEMPLATE_ICONS, DEFAULT_TEMPLATE_DRAFTS } from './AiPromptTemplates';
import type { AiPromptTemplate } from './AiPromptTemplates';

interface AiTemplatesManagerProps {
  templates: AiPromptTemplate[];
  loading: boolean;
  onCreate: (draft: Omit<AiPromptTemplate, 'id'>) => Promise<boolean>;
  onUpdate: (template: AiPromptTemplate) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onClose: () => void;
}

type Draft = Omit<AiPromptTemplate, 'id'>;

const EMPTY_DRAFT: Draft = {
  icon: 'FileText',
  category: 'Мои шаблоны',
  title: '',
  description: '',
  prompt: '',
  recommendedMode: null,
};

function TemplateForm({
  initial, saving, onSave, onCancel,
}: {
  initial: Draft;
  saving: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const canSave = draft.title.trim().length > 0 && draft.prompt.trim().length > 0;

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <select
            value={draft.icon}
            onChange={(e) => set('icon', e.target.value)}
            className="h-9 w-9 rounded-lg border border-border bg-background text-transparent focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
          >
            {PROMPT_TEMPLATE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <Icon name={draft.icon} size={15} className="absolute inset-0 m-auto pointer-events-none text-primary" />
        </div>
        <input
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Название шаблона"
          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft.category}
          onChange={(e) => set('category', e.target.value)}
          placeholder="Категория"
          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={draft.recommendedMode ?? ''}
          onChange={(e) => set('recommendedMode', (e.target.value || null) as Draft['recommendedMode'])}
          className="h-9 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Любой режим</option>
          <option value="chat">Приоритет: Чат</option>
          <option value="code">Приоритет: Код</option>
        </select>
      </div>
      <input
        value={draft.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder="Короткое описание (необязательно)"
        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <textarea
        value={draft.prompt}
        onChange={(e) => set('prompt', e.target.value)}
        placeholder="Текст промпта — фрагменты в [квадратных скобках] сотрудник заполнит перед отправкой"
        rows={5}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none scrollbar-thin"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={!canSave || saving}
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
        >
          {saving && <Icon name="Loader2" size={12} className="animate-spin" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

export default function AiTemplatesManager({
  templates, loading, onCreate, onUpdate, onDelete, onClose,
}: AiTemplatesManagerProps) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);

  async function handleSaveNew(draft: Draft) {
    setSaving(true);
    const ok = await onCreate(draft);
    setSaving(false);
    if (ok) setEditingId(null);
  }

  async function handleSaveEdit(id: number, draft: Draft) {
    setSaving(true);
    const ok = await onUpdate({ id, ...draft });
    setSaving(false);
    if (ok) setEditingId(null);
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить этот шаблон?')) return;
    await onDelete(id);
  }

  async function handleRestoreDefaults() {
    if (!confirm('Добавить стандартный набор из 11 шаблонов? Уже существующие шаблоны не будут затронуты.')) return;
    setRestoringDefaults(true);
    for (const draft of DEFAULT_TEMPLATE_DRAFTS) {
      await onCreate(draft);
    }
    setRestoringDefaults(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon name="LayoutTemplate" size={18} className="text-primary" />
            <h2 className="text-base font-semibold">Мои шаблоны промптов</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Шаблоны видны только вам — создавайте свои под задачи, которые решаете чаще всего.
        </p>

        {loading ? (
          <div className="flex justify-center py-10"><Icon name="Loader2" size={20} className="animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-2 mb-3">
            {templates.map((t) => (
              editingId === t.id ? (
                <TemplateForm
                  key={t.id}
                  initial={t}
                  saving={saving}
                  onSave={(draft) => handleSaveEdit(t.id, draft)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-border p-3 group">
                  <Icon name={t.icon} size={15} className="text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{t.title}</span>
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-secondary shrink-0">{t.category}</span>
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</div>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingId(t.id)}
                      title="Редактировать"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Icon name="Pencil" size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      title="Удалить"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </div>
                </div>
              )
            ))}

            {templates.length === 0 && editingId !== 'new' && (
              <div className="text-center py-8">
                <Icon name="LayoutTemplate" size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">У вас пока нет ни одного шаблона</p>
                <button
                  onClick={handleRestoreDefaults}
                  disabled={restoringDefaults}
                  className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                >
                  {restoringDefaults && <Icon name="Loader2" size={12} className="animate-spin" />}
                  Добавить стандартный набор из 11 шаблонов
                </button>
              </div>
            )}
          </div>
        )}

        {editingId === 'new' ? (
          <TemplateForm
            initial={EMPTY_DRAFT}
            saving={saving}
            onSave={handleSaveNew}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <button
            onClick={() => setEditingId('new')}
            className="w-full h-9 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="Plus" size={14} />
            Новый шаблон
          </button>
        )}
      </div>
    </div>
  );
}
