import { useDraggable, useDroppable } from '@dnd-kit/core';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, ColumnId, TaskOutcome } from './shared';
import { taskAssigneeIds, outcomes, CategoryBadge, PriorityBadge, DeployBadge, DeadlineBadge, AssigneeStack, ServerBadge, taskAge, needsLauncherUpload, LauncherBadge } from './shared';

export function TaskCard({
  task: t,
  index: i,
  team,
  isAdmin,
  canDrag,
  menuFor,
  setMenuFor,
  onCardClick,
  onArchive,
  hasPatchFiles,
}: {
  task: Task;
  index: number;
  team: TeamMember[];
  isAdmin: boolean;
  canDrag: boolean;
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
  onCardClick: (t: Task) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  hasPatchFiles: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canDrag });
  const assignees = taskAssigneeIds(t);
  const showLauncherBadge = needsLauncherUpload(t, hasPatchFiles);
  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      onClick={() => !isDragging && onCardClick(t)}
      className={`group relative rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all cursor-pointer animate-scale-in ${isDragging ? 'opacity-30' : ''} ${canDrag ? 'touch-none' : ''}`}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      {isAdmin && (
        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
            title="Отправить в архив"
            className={`h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all ${menuFor === t.id ? 'opacity-100 text-primary bg-primary/10' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <Icon name="Archive" size={13} />
          </button>
          {menuFor === t.id && (
            <div className="absolute right-0 top-7 w-44 rounded-lg border border-border bg-card shadow-lg p-1 animate-scale-in">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">В архив как</div>
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setMenuFor(null); onArchive(t.id, o.id); }}
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
      )}
      {canDrag && (
        <div
          className="absolute top-2 left-2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          title="Перетащите, чтобы сменить статус"
        >
          <Icon name="GripVertical" size={13} />
        </div>
      )}
      <div className="flex items-center justify-between mb-2 pr-7">
        <CategoryBadge id={t.category} />
        <PriorityBadge p={t.priority} />
      </div>
      <p className="text-sm font-medium leading-snug mb-2">{t.title}</p>
      {(t.deployStatus && t.deployStatus !== 'none') || t.deadline || showLauncherBadge ? (
        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          {t.deployStatus && t.deployStatus !== 'none' && <DeployBadge status={t.deployStatus} />}
          {t.deadline && <DeadlineBadge iso={t.deadline} />}
          {showLauncherBadge && <LauncherBadge uploaded={false} />}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <AssigneeStack ids={assignees} team={team} size={24} />
        <ServerBadge id={t.server} />
        {t.commentCount != null && t.commentCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="MessageSquare" size={11} />
            {t.commentCount}
          </span>
        )}
        {t.kbArticleIds && t.kbArticleIds.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Есть связанные статьи">
            <Icon name="BookOpen" size={11} />
            {t.kbArticleIds.length}
          </span>
        )}
        {t.createdAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto" title="Время жизни задачи">
            <Icon name="Clock" size={11} />
            {taskAge(t.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}

export function Column({ id, children }: { id: ColumnId; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-3 rounded-xl transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/30' : ''}`}
      style={{ minHeight: 40 }}
    >
      {children}
    </div>
  );
}
