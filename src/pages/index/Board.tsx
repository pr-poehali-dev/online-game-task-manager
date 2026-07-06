import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Task, TeamMember, ColumnId, TaskOutcome } from './shared';
import { taskAssigneeIds, columns, outcomes, CategoryBadge, PriorityBadge, DeployBadge, AssigneeStack, ServerBadge } from './shared';

export default function Board({
  tasks,
  team,
  loading,
  onCardClick,
  onAddClick,
  onArchive,
}: {
  tasks: Task[];
  team: TeamMember[];
  loading: boolean;
  onCardClick: (t: Task) => void;
  onAddClick: (col: ColumnId) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Icon name="Loader2" size={26} className="animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.column === col.id);
        return (
          <div key={col.id} className="flex flex-col">
            <div className="flex items-center gap-2 mb-4 px-1">
              <Icon name={col.icon} size={17} className="text-muted-foreground" />
              <h2 className="font-display tracking-wide text-sm uppercase">{col.title}</h2>
              <span className="ml-auto text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">
                {colTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {colTasks.map((t, i) => {
                const assignees = taskAssigneeIds(t);
                return (
                  <div
                    key={t.id}
                    onClick={() => onCardClick(t)}
                    className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all cursor-pointer animate-scale-in"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
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
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => onAddClick(col.id)}
                className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="Plus" size={15} />
                Добавить
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}