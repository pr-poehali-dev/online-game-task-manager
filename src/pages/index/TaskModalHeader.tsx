import Icon from '@/components/ui/icon';
import type { Task, TaskOutcome } from './shared';
import { taskServerIds, outcomes, outcomeMeta, columnMeta, PriorityBadge, ServerBadge } from './shared';

export default function TaskModalHeader({
  task,
  form,
  isEditing,
  canFullEdit,
  canEditDeploy,
  isAdmin,
  canArchive,
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
  // Право закрывать задачи: админ или сотрудник с точечным правом task_archive.
  canArchive: boolean;
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
        {taskServerIds(form).map((sid) => <ServerBadge key={sid} id={sid} />)}
        {(canFullEdit || canEditDeploy) && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-secondary/60 text-muted-foreground">
            <Icon name={columnMeta(form.column).icon} size={12} />
            {columnMeta(form.column).title}
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
            className="h-8 px-3.5 rounded-lg bg-gradient-to-b from-[hsl(38_90%_60%)] to-[hsl(38_85%_50%)] text-primary-foreground text-xs font-medium shadow-accent hover:shadow-accent-hover hover:brightness-[1.06] active:translate-y-px transition-all duration-200 ease-premium flex items-center gap-1.5"
          >
            <Icon name="Pencil" size={14} />
            Редактировать
          </button>
        )}
        {task.archived ? (isAdmin && (
          <button
            onClick={() => onUnarchive(task.id)}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 hover:shadow-sm active:translate-y-px transition-all duration-200 ease-premium flex items-center gap-1.5"
          >
            <Icon name="ArchiveRestore" size={14} />
            Вернуть на доску
          </button>
        )) : (canArchive && (
          <div className="relative">
            <button
              onClick={() => setArchiveMenu((v) => !v)}
              className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 hover:shadow-sm active:translate-y-px transition-all duration-200 ease-premium flex items-center gap-1.5"
            >
              <Icon name="Archive" size={14} />
              В архив
              <Icon name="ChevronDown" size={14} />
            </button>
            {archiveMenu && (
              <div className="absolute right-0 top-9 z-10 w-48 rounded-lg border border-border/70 bg-popover shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.05),0_24px_56px_-16px_hsl(222_30%_2%/0.6)] p-1 animate-scale-in">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 px-2 py-1">Исход задачи</div>
                {outcomes.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setArchiveMenu(false); onArchive(task.id, o.id); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-all duration-200 ease-premium"
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
            className="h-8 px-3 rounded-lg border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 hover:border-destructive/60 active:translate-y-px transition-all duration-200 ease-premium"
          >
            Удалить
          </button>
        )}
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all duration-200 ease-premium">
          <Icon name="X" size={16} />
        </button>
      </div>
    </div>
  );
}