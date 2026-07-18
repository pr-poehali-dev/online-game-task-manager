import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Sprint, Task } from './shared';
import { ModalOverlay, Select, inputCls, servers, CategoryBadge, PriorityBadge } from './shared';

function TaskMultiSelect({ tasks, value, onChange }: {
  tasks: Task[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];

  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Icon name="ClipboardList" size={12} />
        Задачи с доски (без спринта)
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не выбрано</span>}
        {selected.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs max-w-[200px]">
            <span className="truncate">{t.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); toggle(t.id); }}
              className="hover:text-foreground cursor-pointer shrink-0"
            >
              <Icon name="X" size={11} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-card p-1 max-h-60 overflow-auto scrollbar-thin">
          {tasks.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">Нет свободных задач без спринта</div>}
          {tasks.map((t) => {
            const active = value.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors text-left"
              >
                <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                <span className="truncate flex-1">{t.title}</span>
                <CategoryBadge id={t.category} />
                <PriorityBadge p={t.priority} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SprintEditModal({ sprint, onClose, onSave }: {
  sprint: Sprint;
  onClose: () => void;
  onSave: (s: Sprint) => void;
}) {
  const [form, setForm] = useState<Sprint>({ ...sprint });
  const set = (k: keyof Sprint, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <h2 className="font-display tracking-wide text-lg">Редактировать спринт</h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Цель спринта</label>
          <textarea value={form.goal} onChange={(e) => set('goal', e.target.value)} rows={2}
            className={inputCls + ' resize-none'} placeholder="Что должны сделать за этот спринт..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Начало</label>
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Конец</label>
            <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
          </div>
        </div>
        <Select label="Статус" value={form.status} onChange={(v) => set('status', v)} options={[
          { value: 'planned', label: 'Запланирован' },
          { value: 'active', label: 'Активный' },
          { value: 'done', label: 'Завершён' },
        ]} />
      </div>
      <div className="flex justify-end gap-3 px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        <button onClick={() => onSave(form)} className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Сохранить</button>
      </div>
    </ModalOverlay>
  );
}

export function CreateSprintModal({ onClose, onCreate, availableTasks }: {
  onClose: () => void;
  onCreate: (s: Sprint, taskIds: string[]) => void;
  availableTasks: Task[];
}) {
  const today = new Date().toISOString().split('T')[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const [form, setForm] = useState<Sprint>({
    id: 's' + Date.now(),
    title: '',
    goal: '',
    startDate: today,
    endDate: twoWeeks,
    status: 'planned',
    server: null,
  });
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const set = (k: keyof Sprint, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const filteredTasks = form.server
    ? availableTasks.filter((t) => t.server === form.server)
    : availableTasks;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <h2 className="font-display tracking-wide text-lg">Новый спринт</h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Спринт 4 · Летний ивент" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Цель спринта</label>
          <textarea value={form.goal} onChange={(e) => set('goal', e.target.value)} rows={2}
            className={inputCls + ' resize-none'} placeholder="Что должны сделать за этот спринт..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Начало</label>
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Конец</label>
            <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Статус" value={form.status} onChange={(v) => set('status', v)} options={[
            { value: 'planned', label: 'Запланирован' },
            { value: 'active', label: 'Активный' },
            { value: 'done', label: 'Завершён' },
          ]} />
          <Select label="Сервер" value={form.server ?? ''} onChange={(v) => set('server', v)} options={[
            { value: '', label: '— Без привязки —' },
            ...servers.map((s) => ({ value: s.id, label: s.label })),
          ]} />
        </div>
        <TaskMultiSelect tasks={filteredTasks} value={taskIds} onChange={setTaskIds} />
      </div>
      <div className="flex justify-end gap-3 px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        <button
          onClick={() => { if (form.title.trim()) onCreate(form, taskIds); }}
          disabled={!form.title.trim()}
          className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Создать
        </button>
      </div>
    </ModalOverlay>
  );
}