import { useDroppable } from '@dnd-kit/core';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, ColumnId, TaskOutcome } from './shared';
import { holdColumn } from './shared';
import type { PermissionKey } from '@/lib/auth';
import { TaskCard } from './BoardTaskCard';
import { canDragTask } from './boardSort';

// Свёрнутая по умолчанию колонка «На удержании» слева от To Do — сюда откладывают задачи
// любого статуса деплоя, не меняя сам статус. В свёрнутом виде — узкая полоса со счётчиком,
// остаётся зоной для сброса карточки перетаскиванием даже без разворачивания. В развёрнутом
// виде выглядит как обычная колонка доски.
export function HoldSection({
  tasks,
  open,
  setOpen,
  team,
  isAdmin,
  can,
  currentUserId,
  menuFor,
  setMenuFor,
  onCardClick,
  onArchive,
  onAddClick,
  tasksWithPatchFiles,
}: {
  tasks: Task[];
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  team: TeamMember[];
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
  onCardClick: (t: Task) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  onAddClick: (col: ColumnId) => void;
  tasksWithPatchFiles: Set<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'hold' });

  if (!open) {
    return (
      <button
        ref={setNodeRef}
        onClick={() => setOpen(true)}
        className={`flex flex-col items-center gap-2 rounded-xl border border-dashed py-4 px-1.5 w-11 shrink-0 transition-colors ${
          isOver ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/40'
        }`}
        title="Развернуть «На удержании»"
      >
        <Icon name="ChevronRight" size={14} className="text-muted-foreground" />
        <Icon name={holdColumn.icon} size={15} className="text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-md">
          {tasks.length}
        </span>
        <span className="flex flex-col items-center leading-tight text-[10px] font-semibold uppercase text-muted-foreground mt-1">
          {'HOLD'.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col w-full md:w-64 shrink-0">
      <div className="flex items-center gap-2 mb-4 px-1">
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Icon name="ChevronLeft" size={15} />
        </button>
        <Icon name={holdColumn.icon} size={17} className="text-muted-foreground" />
        <h2 className="font-display tracking-wide text-sm uppercase">{holdColumn.title}</h2>
        <span className="ml-auto text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">
          {tasks.length}
        </span>
      </div>
      <div ref={setNodeRef} className={`space-y-3 rounded-xl transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/30' : ''}`} style={{ minHeight: 40 }}>
        {tasks.map((t, i) => (
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
            onClick={() => onAddClick('hold')}
            className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Добавить
          </button>
        )}
      </div>
    </div>
  );
}
