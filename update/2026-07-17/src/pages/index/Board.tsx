import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, ColumnId, TaskOutcome, DeployStatus } from './shared';
import { taskAssigneeIds, columns, outcomes, deployStatuses, CategoryBadge, PriorityBadge, DeployBadge, AssigneeStack, ServerBadge, taskAge } from './shared';
import type { PermissionKey } from '@/lib/auth';

type SortMode = 'none' | 'priority' | 'date_new' | 'date_old';

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: 'none', label: 'По умолчанию', icon: 'ArrowUpDown' },
  { id: 'priority', label: 'По приоритету', icon: 'Flame' },
  { id: 'date_new', label: 'Сначала новые', icon: 'ArrowDown10' },
  { id: 'date_old', label: 'Сначала старые', icon: 'ArrowUp10' },
];

function sortTasks(list: Task[], mode: SortMode): Task[] {
  if (mode === 'none') return list;
  const arr = [...list];
  if (mode === 'priority') {
    arr.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  } else if (mode === 'date_new') {
    arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  } else if (mode === 'date_old') {
    arr.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  }
  return arr;
}

function canDragTask(t: Task, currentUserId: number | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (currentUserId == null) return false;
  const isCreator = t.creatorId != null && t.creatorId === currentUserId;
  const isAssignee = taskAssigneeIds(t).includes(currentUserId);
  return isCreator || isAssignee;
}

function TaskCard({
  task: t,
  index: i,
  team,
  isAdmin,
  canDrag,
  menuFor,
  setMenuFor,
  onCardClick,
  onArchive,
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
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canDrag });
  const assignees = taskAssigneeIds(t);
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
      {t.deployStatus && t.deployStatus !== 'none' && (
        <div className="mb-2">
          <DeployBadge status={t.deployStatus} />
        </div>
      )}
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

function Column({ id, children }: { id: ColumnId; children: React.ReactNode }) {
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

export default function Board({
  tasks,
  team,
  loading,
  onCardClick,
  onAddClick,
  onArchive,
  onMoveTask,
  isAdmin,
  can,
  currentUserId,
}: {
  tasks: Task[];
  team: TeamMember[];
  loading: boolean;
  onCardClick: (t: Task) => void;
  onAddClick: (col: ColumnId) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  onMoveTask: (task: Task, column: ColumnId, deployStatus: DeployStatus) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('none');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ task: Task; targetColumn: ColumnId; options: typeof deployStatuses } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const targetColumn = over.id as ColumnId;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.column === targetColumn) return;
    if (!canDragTask(task, currentUserId, isAdmin)) return;
    const options = deployStatuses.filter((d) => d.column === targetColumn);
    if (options.length <= 1) {
      onMoveTask(task, targetColumn, options[0]?.id ?? 'none');
    } else {
      setPendingDrop({ task, targetColumn, options });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Icon name="Loader2" size={26} className="animate-spin text-primary" />
      </div>
    );
  }
  const activeSort = SORT_OPTIONS.find((o) => o.id === sortMode)!;
  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) ?? null : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="animate-fade-in">
        <div className="flex justify-end mb-3 relative">
          <button
            onClick={() => setSortOpen((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              sortMode !== 'none' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            <Icon name={activeSort.icon} size={13} />
            {activeSort.label}
            <Icon name="ChevronDown" size={12} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-border bg-card shadow-lg p-1 animate-scale-in">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setSortMode(o.id); setSortOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    sortMode === o.id ? 'bg-primary/15 text-primary' : 'hover:bg-secondary/60'
                  }`}
                >
                  <Icon name={o.icon} size={14} />
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {columns.map((col) => {
            const colTasks = sortTasks(tasks.filter((t) => t.column === col.id), sortMode);
            return (
              <div key={col.id} className="flex flex-col">
                <div className="flex items-center gap-2 mb-4 px-1">
                  <Icon name={col.icon} size={17} className="text-muted-foreground" />
                  <h2 className="font-display tracking-wide text-sm uppercase">{col.title}</h2>
                  <span className="ml-auto text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">
                    {colTasks.length}
                  </span>
                </div>
                <Column id={col.id}>
                  {colTasks.map((t, i) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      index={i}
                      team={team}
                      isAdmin={isAdmin}
                      canDrag={canDragTask(t, currentUserId, isAdmin)}
                      menuFor={menuFor}
                      setMenuFor={setMenuFor}
                      onCardClick={onCardClick}
                      onArchive={onArchive}
                    />
                  ))}
                  {can('task_create') && (
                    <button
                      onClick={() => onAddClick(col.id)}
                      className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon name="Plus" size={15} />
                      Добавить
                    </button>
                  )}
                </Column>
              </div>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rounded-xl border border-primary/50 bg-card p-4 shadow-xl w-72 rotate-2">
            <div className="flex items-center justify-between mb-2">
              <CategoryBadge id={activeTask.category} />
              <PriorityBadge p={activeTask.priority} />
            </div>
            <p className="text-sm font-medium leading-snug">{activeTask.title}</p>
          </div>
        )}
      </DragOverlay>

      {pendingDrop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setPendingDrop(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-border bg-card shadow-xl p-3 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-muted-foreground px-1 pb-2 mb-1 border-b border-border">
              Статус деплоя для «{pendingDrop.task.title}»
            </div>
            <div className="space-y-0.5">
              {pendingDrop.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { onMoveTask(pendingDrop.task, pendingDrop.targetColumn, o.id); setPendingDrop(null); }}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary/60 transition-colors"
                  style={{ color: `hsl(${o.color})` }}
                >
                  <Icon name={o.icon} size={14} className="shrink-0 mt-0.5" />
                  <span className="leading-snug">{o.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingDrop(null)}
              className="w-full mt-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </DndContext>
  );
}