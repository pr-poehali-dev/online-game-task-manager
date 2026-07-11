import Icon from '@/components/ui/icon';
import type { Task, Sprint } from './shared';
import type { PermissionKey } from '@/lib/auth';

const statusMeta: Record<Sprint['status'], { label: string; color: string; icon: string }> = {
  active:  { label: 'Активный', color: '152 55% 50%', icon: 'Zap' },
  planned: { label: 'Запланирован', color: '210 80% 62%', icon: 'Clock' },
  done:    { label: 'Завершён', color: '215 15% 50%', icon: 'CheckCircle2' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function SprintCard({ sprint, index, tasks, onFilterBoard, onEdit, onDelete, isAdmin, can }: {
  sprint: Sprint;
  index: number;
  tasks: Task[];
  onFilterBoard: (sprintId: string) => void;
  onEdit: (s: Sprint) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
}) {
  const sp = sprint;
  const i = index;
  const spTasks = tasks.filter((t) => t.sprintId === sp.id);
  const done = spTasks.filter((t) => t.column === 'done').length;
  const total = spTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const sm = statusMeta[sp.status];

  return (
    <div
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
          {can('sprint_edit') && (
            <button
              onClick={() => onEdit({ ...sp })}
              className="h-8 w-8 rounded-lg bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
            >
              <Icon name="Pencil" size={13} />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onDelete(sp.id)}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
            >
              <Icon name="Trash2" size={13} />
            </button>
          )}
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