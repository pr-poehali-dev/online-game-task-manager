import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Sprint } from './shared';
import { ModalOverlay, Select, inputCls } from './shared';

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

export function CreateSprintModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (s: Sprint) => void;
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
  });
  const set = (k: keyof Sprint, v: string) => setForm((p) => ({ ...p, [k]: v }));

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
        <Select label="Статус" value={form.status} onChange={(v) => set('status', v)} options={[
          { value: 'planned', label: 'Запланирован' },
          { value: 'active', label: 'Активный' },
          { value: 'done', label: 'Завершён' },
        ]} />
      </div>
      <div className="flex justify-end gap-3 px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        <button
          onClick={() => { if (form.title.trim()) onCreate(form); }}
          disabled={!form.title.trim()}
          className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Создать
        </button>
      </div>
    </ModalOverlay>
  );
}
