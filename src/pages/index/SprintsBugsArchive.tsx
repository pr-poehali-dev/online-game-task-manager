import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, Sprint, TaskOutcome } from './shared';
import { resolveAssignee, taskAssigneeIds, categoryMeta, outcomes, outcomeMeta, AssigneeStack, ModalOverlay, Select, inputCls } from './shared';

export function Archive({ tasks, total, team, outcomeFilter, onOutcomeFilter, onCardClick, onRestore, onDelete }: {
  tasks: Task[];
  total: number;
  team: TeamMember[];
  outcomeFilter: TaskOutcome | 'all';
  onOutcomeFilter: (o: TaskOutcome | 'all') => void;
  onCardClick: (t: Task) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="Archive" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Архив задач</h2>
        <span className="text-sm text-muted-foreground">· {total} в архиве</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Завершённые и закрытые задачи. Можно вернуть любую обратно на доску.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => onOutcomeFilter('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            outcomeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          Все
        </button>
        {outcomes.map((o) => {
          const active = outcomeFilter === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onOutcomeFilter(o.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
              style={{
                background: active ? `hsl(${o.color} / 0.18)` : 'transparent',
                borderColor: active ? `hsl(${o.color} / 0.5)` : 'hsl(var(--border))',
                color: active ? `hsl(${o.color})` : 'hsl(var(--muted-foreground))',
              }}
            >
              <Icon name={o.icon} size={12} />
              {o.label}
            </button>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Archive" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">В архиве пока пусто</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => {
            const ids = taskAssigneeIds(t);
            const namesLabel = ids.length > 0 ? ids.map((id) => resolveAssignee(team, id).name).join(', ') : 'Не назначен';
            const om = outcomeMeta(t.outcome ?? 'done');
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors group"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0"
                  style={{ background: `hsl(${om.color} / 0.15)`, color: `hsl(${om.color})` }}
                >
                  <Icon name={om.icon} size={12} />
                  {om.label}
                </span>
                <button onClick={() => onCardClick(t)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{categoryMeta(t.category).label} · {namesLabel}</div>
                </button>
                <AssigneeStack ids={ids} team={team} size={26} />
                {confirmId === t.id ? (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Удалить навсегда?</span>
                    <button
                      onClick={() => { setConfirmId(null); onDelete(t.id); }}
                      className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onRestore(t.id)}
                      title="Вернуть на доску"
                      className="shrink-0 h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="ArchiveRestore" size={13} />
                      <span className="hidden sm:inline">Вернуть</span>
                    </button>
                    <button
                      onClick={() => setConfirmId(t.id)}
                      title="Удалить навсегда"
                      className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sprints({ sprints, tasks, onUpdate, onDelete, onFilterBoard }: {
  sprints: Sprint[];
  tasks: Task[];
  onUpdate: (s: Sprint) => void;
  onDelete: (id: string) => void;
  onFilterBoard: (sprintId: string) => void;
}) {
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const statusMeta: Record<Sprint['status'], { label: string; color: string; icon: string }> = {
    active:  { label: 'Активный', color: '152 55% 50%', icon: 'Zap' },
    planned: { label: 'Запланирован', color: '210 80% 62%', icon: 'Clock' },
    done:    { label: 'Завершён', color: '215 15% 50%', icon: 'CheckCircle2' },
  };

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  const activeSprints = sprints.filter((s) => s.status !== 'done');
  const archivedSprints = sprints.filter((s) => s.status === 'done');

  function renderSprint(sp: Sprint, i: number) {
          const spTasks = tasks.filter((t) => t.sprintId === sp.id);
          const done = spTasks.filter((t) => t.column === 'done').length;
          const total = spTasks.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const sm = statusMeta[sp.status];

          return (
            <div
              key={sp.id}
              className="rounded-xl border border-border bg-card p-5 animate-fade-in transition-all hover:border-primary/30"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md"
                      style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}
                    >
                      {sp.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                      <Icon name={sm.icon} size={11} />
                      {sm.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sp.startDate)} — {formatDate(sp.endDate)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-base leading-tight">{sp.title}</h3>
                  {sp.goal && (
                    <p className="text-sm text-muted-foreground mt-1">{sp.goal}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => onFilterBoard(sp.id)}
                    title="Открыть на доске"
                    className="h-8 px-2.5 rounded-lg bg-secondary/60 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="LayoutGrid" size={13} />
                    Доска
                  </button>
                  <button
                    onClick={() => setEditing({ ...sp })}
                    className="h-8 w-8 rounded-lg bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
                  >
                    <Icon name="Pencil" size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(sp.id)}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                  >
                    <Icon name="Trash2" size={13} />
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100 ? 'hsl(152 55% 50%)' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                  {done}/{total} задач · {pct}%
                </span>
              </div>
            </div>
          );
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Icon name="Zap" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Спринты</h2>
        <span className="text-sm text-muted-foreground">· {activeSprints.length} активных</span>
      </div>

      <div className="space-y-4">
        {activeSprints.map((sp, i) => renderSprint(sp, i))}

        {activeSprints.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Активных спринтов нет — создай новый
          </div>
        )}
      </div>

      {archivedSprints.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <Icon name={showArchive ? 'ChevronDown' : 'ChevronRight'} size={16} />
            <Icon name="Archive" size={15} />
            Архив спринтов
            <span className="text-xs font-mono opacity-60">{archivedSprints.length}</span>
          </button>
          {showArchive && (
            <div className="space-y-4 opacity-80">
              {archivedSprints.map((sp, i) => renderSprint(sp, i))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <SprintEditModal
          sprint={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { onUpdate(updated); setEditing(null); }}
        />
      )}
    </div>
  );
}

function SprintEditModal({ sprint, onClose, onSave }: {
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