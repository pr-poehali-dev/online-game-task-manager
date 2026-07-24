import Icon from '@/components/ui/icon';
import type { Task, TaskOutcome } from './shared';
import { outcomes, outcomeMeta, columns, PriorityBadge, ServerBadge } from './shared';

export default function TaskModalHeader({
  task,
  form,
  isEditing,
  canFullEdit,
  canEditDeploy,
  isAdmin,
  archiveMenu,
  setArchiveMenu,
  onClose,
  onDelete,
  onArchive,
  onUnarchive,
  onStartEdit,
}: {
  task: Task;
  form: Task;
  isEditing: boolean;
  canFullEdit: boolean;
  canEditDeploy: boolean;
  isAdmin: boolean;
  archiveMenu: boolean;
  setArchiveMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  onUnarchive: (id: string) => void;
  onStartEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
      <div className="flex items-center gap-3">
        <PriorityBadge p={form.priority} />
        <ServerBadge id={form.server} />
        {(canFullEdit || canEditDeploy) && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-secondary/60 text-muted-foreground">
            <Icon name={columns.find((c) => c.id === form.column)?.icon ?? 'Circle'} size={12} />
            {columns.find((c) => c.id === form.column)?.title ?? form.column}
          </span>
        )}
        {task.archived && task.outcome && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md"
            style={{ background: `hsl(${outcomeMeta(task.outcome).color} / 0.15)`, color: `hsl(${outcomeMeta(task.outcome).color})` }}
          >
            <Icon name={outcomeMeta(task.outcome).icon} size={12} />
            {outcomeMeta(task.outcome).label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isEditing && (canFullEdit || canEditDeploy) && (
          <button
            onClick={onStartEdit}
            className="h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="Pencil" size={13} />
            Редактировать
          </button>
        )}
        {isAdmin && (task.archived ? (
          <button
            onClick={() => onUnarchive(task.id)}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
          >
            <Icon name="ArchiveRestore" size={13} />
            Вернуть на доску
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setArchiveMenu((v) => !v)}
              className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
            >
              <Icon name="Archive" size={13} />
              В архив
              <Icon name="ChevronDown" size={12} />
            </button>
            {archiveMenu && (
              <div className="absolute right-0 top-9 z-10 w-48 rounded-lg border border-border bg-card shadow-lg p-1 animate-scale-in">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">Исход задачи</div>
                {outcomes.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setArchiveMenu(false); onArchive(task.id, o.id); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors"
                    style={{ color: `hsl(${o.color})` }}
                  >
                    <Icon name={o.icon} size={14} />
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isAdmin && (
          <button
            onClick={() => onDelete(task.id)}
            className="h-8 px-3 rounded-lg border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 transition-colors"
          >
            Удалить
          </button>
        )}
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>
    </div>
  );
}
