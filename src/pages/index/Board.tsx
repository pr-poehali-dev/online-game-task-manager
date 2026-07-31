import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, ColumnId, TaskOutcome, DeployStatus } from './shared';
import { columns, deployStatuses, CategoryBadge, PriorityBadge } from './shared';
import type { PermissionKey } from '@/lib/auth';
import { TaskCard, Column } from './BoardTaskCard';
import { HoldSection } from './BoardHoldSection';
import { SORT_OPTIONS, sortTasks, canDragTask } from './boardSort';
import type { SortMode } from './boardSort';

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
  tasksWithPatchFiles,
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
  tasksWithPatchFiles: Set<string>;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ task: Task; targetColumn: ColumnId; options: typeof deployStatuses } | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);

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
    // «На удержании» не привязана к статусу деплоя: перенос сюда не меняет статус,
    // а при снятии с удержания пользователь всегда сам выбирает целевую колонку.
    if (targetColumn === 'hold') {
      onMoveTask(task, 'hold', task.deployStatus ?? 'none');
      return;
    }
    if (task.column === 'hold') {
      setPendingDrop({ task, targetColumn, options: deployStatuses.filter((d) => d.column === targetColumn) });
      return;
    }
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
              sortMode !== 'smart' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
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
        <div className="flex items-start gap-5">
          <HoldSection
            tasks={sortTasks(tasks.filter((t) => t.column === 'hold'), sortMode)}
            open={holdOpen}
            setOpen={setHoldOpen}
            team={team}
            isAdmin={isAdmin}
            can={can}
            currentUserId={currentUserId}
            menuFor={menuFor}
            setMenuFor={setMenuFor}
            onCardClick={onCardClick}
            onArchive={onArchive}
            onAddClick={onAddClick}
            tasksWithPatchFiles={tasksWithPatchFiles}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-w-0">
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
                        hasPatchFiles={tasksWithPatchFiles.has(t.id)}
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
