import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, TaskOutcome } from './shared';
import { taskAssigneeIds, outcomes, servers, serverMeta, CategoryBadge, PriorityBadge, DeployBadge, AssigneeStack, ServerBadge, needsLauncherUpload, LauncherBadge } from './shared';
import type { PermissionKey } from '@/lib/auth';

export default function Restart({
  tasks,
  team,
  loading,
  onCardClick,
  onAddClick,
  onToRestart,
  onFromRestart,
  onToggleDone,
  onArchive,
  isAdmin,
  can,
  currentUserId,
  tasksWithPatchFiles,
}: {
  tasks: Task[];
  team: TeamMember[];
  loading: boolean;
  onCardClick: (t: Task) => void;
  onAddClick: () => void;
  onToRestart: (id: string) => void;
  onFromRestart: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
  tasksWithPatchFiles: Set<string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [archiveMenu, setArchiveMenu] = useState<string | null>(null);

  const restartTasks = tasks.filter((t) => !t.archived && t.column === 'restart');
  // Кандидаты на перенос: не в архиве, не в рестарте, готовы к заливке на лайв или в колонке Done
  const canRestart = isAdmin || can('task_restart');
  const candidates = tasks
    .filter((t) => !t.archived && t.column !== 'restart' && (t.deployStatus === 'ready_live' || t.column === 'done'))
    .filter((t) => isAdmin || taskAssigneeIds(t).includes(currentUserId ?? -1) || t.creatorId === currentUserId);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Icon name="Loader2" size={26} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="RotateCcw" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">К рестарту</h2>
        <span className="text-sm text-muted-foreground">· {restartTasks.length} задач</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Короткие задачи, которые применяются во время плановых технических работ. Отметьте «Готово» после выполнения и отправьте в архив.</p>

      {(can('task_create') || canRestart) && (
        <div className="flex items-center gap-2 mb-5">
          {can('task_create') && (
            <button
              onClick={onAddClick}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Icon name="Plus" size={15} />
              Новая задача
            </button>
          )}
          {canRestart && (
            <div className="relative">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <Icon name="ArrowDownToLine" size={15} />
                Перенести задачу
                <Icon name="ChevronDown" size={13} />
              </button>
              {pickerOpen && (
                <div className="absolute left-0 top-11 z-20 w-80 rounded-lg border border-border bg-card shadow-lg p-1 max-h-80 overflow-auto scrollbar-thin animate-scale-in">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1.5">Готовы к заливке / из «Готово»</div>
                  {candidates.length === 0 && (
                    <div className="text-xs text-muted-foreground px-2 py-3">Нет подходящих задач</div>
                  )}
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setPickerOpen(false); onToRestart(t.id); }}
                      className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-secondary/60 transition-colors"
                    >
                      <Icon name="ArrowRight" size={13} className="text-primary shrink-0" />
                      <span className="truncate flex-1">{t.title}</span>
                      {t.deployStatus === 'ready_live' && <Icon name="Rocket" size={12} className="text-[hsl(45_90%_55%)] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {restartTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="RotateCcw" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Список к рестарту пуст</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const knownIds = new Set(servers.map((s) => s.id));
            const extraIds = Array.from(new Set(restartTasks.map((t) => t.server).filter((id) => !knownIds.has(id))));
            const groups = [
              ...servers,
              ...extraIds.map((id) => serverMeta(id)),
            ].map((srv) => ({ srv, tasksForServer: restartTasks.filter((t) => t.server === srv.id) }))
              .filter(({ tasksForServer }) => tasksForServer.length > 0);
            return groups;
          })()
            .map(({ srv, tasksForServer }) => (
              <div key={srv.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `hsl(${srv.color})` }} />
                  <h3 className="text-sm font-semibold">{srv.label}</h3>
                  <span className="text-xs text-muted-foreground">· {tasksForServer.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {tasksForServer.map((t) => (
                    <RestartTaskCard
                      key={t.id}
                      task={t}
                      team={team}
                      isAdmin={isAdmin}
                      archiveMenu={archiveMenu}
                      setArchiveMenu={setArchiveMenu}
                      onCardClick={onCardClick}
                      onFromRestart={onFromRestart}
                      onToggleDone={onToggleDone}
                      onArchive={onArchive}
                      hasPatchFiles={tasksWithPatchFiles.has(t.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function RestartTaskCard({
  task: t,
  team,
  isAdmin,
  archiveMenu,
  setArchiveMenu,
  onCardClick,
  onFromRestart,
  onToggleDone,
  onArchive,
  hasPatchFiles,
}: {
  task: Task;
  team: TeamMember[];
  isAdmin: boolean;
  archiveMenu: string | null;
  setArchiveMenu: (id: string | null) => void;
  onCardClick: (t: Task) => void;
  onFromRestart: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  hasPatchFiles: boolean;
}) {
  const assignees = taskAssigneeIds(t);
  const done = !!t.restartDone;
  const showLauncherBadge = needsLauncherUpload(t, hasPatchFiles);
  return (
    <div
      onClick={() => onCardClick(t)}
      className={`group relative rounded-xl border bg-card p-4 transition-all animate-scale-in cursor-pointer hover:border-primary/50 ${archiveMenu === t.id ? 'z-20' : ''}`}
      style={done
        ? { borderColor: 'hsl(152 55% 45% / 0.6)', background: 'hsl(152 55% 45% / 0.08)' }
        : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <CategoryBadge id={t.category} />
        <div className="flex items-center gap-2">
          <PriorityBadge p={t.priority} />
          {done && <Icon name="CircleCheck" size={16} className="text-[hsl(152_55%_50%)]" />}
        </div>
      </div>
      <p className="text-sm font-medium leading-snug mb-2">{t.title}</p>
      {(t.deployStatus && t.deployStatus !== 'none') || showLauncherBadge ? (
        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          {t.deployStatus && t.deployStatus !== 'none' && <DeployBadge status={t.deployStatus} />}
          {showLauncherBadge && <LauncherBadge uploaded={false} />}
        </div>
      ) : null}
      <div className="flex items-center gap-2 mb-3">
        <AssigneeStack ids={assignees} team={team} size={24} />
        <ServerBadge id={t.server} />
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {done ? (
            <>
              <button
                onClick={() => onToggleDone(t.id, false)}
                className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
              >
                <Icon name="Undo2" size={13} />
                Вернуть
              </button>
              <div className="relative ml-auto">
                <button
                  onClick={() => setArchiveMenu(archiveMenu === t.id ? null : t.id)}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  <Icon name="Archive" size={13} />
                  В архив
                  <Icon name="ChevronDown" size={12} />
                </button>
                {archiveMenu === t.id && (
                  <div className="absolute right-0 top-9 z-30 w-44 rounded-lg border border-border bg-card shadow-lg p-1 animate-scale-in">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">Исход задачи</div>
                    {outcomes.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => { setArchiveMenu(null); onArchive(t.id, o.id); }}
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
            </>
          ) : (
            <button
              onClick={() => onToggleDone(t.id, true)}
              className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-[hsl(152_55%_45%)]/50 hover:bg-[hsl(152_55%_45%)]/10 hover:text-[hsl(152_55%_55%)] transition-colors flex items-center gap-1.5"
            >
              <Icon name="Check" size={14} />
              Готово
            </button>
          )}
          <button
            onClick={() => onFromRestart(t.id)}
            title="Вернуть задачу обратно в колонку Done"
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
          >
            <Icon name="ArrowLeftFromLine" size={13} />
            В Done
          </button>
        </div>
      )}
    </div>
  );
}