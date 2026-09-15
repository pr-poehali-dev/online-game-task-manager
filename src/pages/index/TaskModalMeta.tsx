import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import { useCatalog } from '@/lib/catalog';
import type { Task, TeamMember, Sprint } from './shared';
import { taskAssigneeIds, taskServerIds, taskSprintIds, resolveAssignee, CategoryBadge, DeadlineBadge, AssigneeAvatar, Select, formatMskDateTime } from './shared';
import { AssigneeMultiSelect, KbMultiSelect, ServerMultiSelect, SprintMultiSelect } from './TaskModalShared';

export default function TaskModalMeta({
  task,
  form,
  set,
  team,
  kbArticles,
  onOpenArticle,
  sprints,
  isEditing,
  canFullEdit,
  canEditDeploy,
  setAssignees,
  setKbIds,
  setServers,
  setSprints,
  deadlineLocal,
  setDeadlineLocal,
}: {
  task: Task;
  form: Task;
  set: (k: keyof Task, v: string) => void;
  team: TeamMember[];
  kbArticles: KbArticleBrief[];
  onOpenArticle: (id: string) => void;
  sprints: Sprint[];
  isEditing: boolean;
  canFullEdit: boolean;
  canEditDeploy: boolean;
  setAssignees: (ids: number[]) => void;
  setKbIds: (ids: number[]) => void;
  setServers: (ids: string[]) => void;
  setSprints: (ids: string[]) => void;
  deadlineLocal: string;
  setDeadlineLocal: (v: string) => void;
}) {
  const { categories } = useCatalog();
  return (
    <>
      {/* Title */}
      <div>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          readOnly={!isEditing || !canFullEdit}
          className="w-full bg-transparent text-lg font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-primary/50 pb-1 transition-all duration-200 ease-premium"
          placeholder="Название задачи"
        />
      </div>

      {/* Creation meta: дата создания по МСК + автор */}
      {(task.createdAt || task.creatorId != null) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground -mt-3">
          {task.createdAt && (
            <span className="flex items-center gap-1">
              <Icon name="Calendar" size={12} />
              Создана {formatMskDateTime(task.createdAt)}
            </span>
          )}
          {task.creatorId != null && (
            <span className="flex items-center gap-1">
              <AssigneeAvatar a={resolveAssignee(team, task.creatorId)} size={16} />
              {resolveAssignee(team, task.creatorId).name}
            </span>
          )}
        </div>
      )}

      {/* Кто и когда закрыл задачу — только у закрытых задач, рядом с данными о создании */}
      {task.archived && (task.closedBy != null || task.archivedAt) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground -mt-2">
          {task.archivedAt && (
            <span className="flex items-center gap-1">
              <Icon name="Archive" size={12} />
              Закрыта {formatMskDateTime(task.archivedAt)}
            </span>
          )}
          {task.closedBy != null && (
            <span className="flex items-center gap-1">
              <AssigneeAvatar a={resolveAssignee(team, task.closedBy)} size={16} />
              {resolveAssignee(team, task.closedBy).name}
            </span>
          )}
        </div>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {isEditing && !canFullEdit && !canEditDeploy && (
          <Select compact label="Колонка" value={form.column} onChange={(v) => set('column', v)} options={[
            { value: 'todo', label: 'To Do' },
            { value: 'progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
            { value: 'hold', label: 'На удержании' },
          ]} />
        )}
        {isEditing && canFullEdit ? (
          <>
            <Select compact label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
              { value: 'critical', label: 'Критический' },
              { value: 'high', label: 'Высокий' },
              { value: 'medium', label: 'Средний' },
              { value: 'low', label: 'Низкий' },
            ]} />
            <ServerMultiSelect compact value={taskServerIds(form)} onChange={setServers} />
            <Select compact label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
              categories.map((c) => ({ value: c.id, label: c.label }))
            } />
            <AssigneeMultiSelect compact team={team} value={taskAssigneeIds(form)} onChange={setAssignees} />
            <SprintMultiSelect compact sprints={sprints} value={taskSprintIds(form)} onChange={setSprints} />
            <div>
              <label className="block text-[11px] tracking-[0.01em] text-muted-foreground mb-1">Дедлайн (МСК)</label>
              <input
                type="datetime-local"
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground transition-all duration-200 ease-premium hover:bg-secondary/70 focus:outline-none focus:border-primary/50 focus:bg-secondary/70"
              />
            </div>
            <div className="md:col-span-4">
              <KbMultiSelect compact articles={kbArticles} value={form.kbArticleIds ?? []} onChange={setKbIds} />
            </div>
          </>
        ) : (
          <div className="col-span-2 md:col-span-4 rounded-lg border border-border/70 bg-secondary/20 shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.03)] px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">Категория</span>
              <CategoryBadge id={form.category} />
            </div>
            {task.deadline && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">Дедлайн</span>
                <DeadlineBadge iso={task.deadline} />
              </div>
            )}
            {taskSprintIds(form).some((id) => sprints.find((s) => s.id === id)) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  {taskSprintIds(form).length > 1 ? 'Спринты' : 'Спринт'}
                </span>
                {taskSprintIds(form).map((id) => {
                  const sp = sprints.find((s) => s.id === id);
                  if (!sp) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs font-medium">
                      <Icon name="Zap" size={12} />
                      {sp.title}
                    </span>
                  );
                })}
              </div>
            )}
            {taskAssigneeIds(form).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">Исполнители</span>
                {taskAssigneeIds(form).map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5 text-xs">
                    <AssigneeAvatar a={resolveAssignee(team, id)} size={14} />
                    {resolveAssignee(team, id).name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Related articles quick links */}
      {(form.kbArticleIds ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(form.kbArticleIds ?? []).map((id) => {
            const art = kbArticles.find((a) => Number(a.id) === id);
            if (!art) return null;
            return (
              <button
                key={id}
                onClick={() => onOpenArticle(art.id)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary/40 hover:border-primary/50 hover:text-primary hover:bg-secondary/60 transition-all duration-200 ease-premium"
              >
                <Icon name="BookOpen" size={12} />
                <span className="truncate max-w-[240px]">{art.title}</span>
                <Icon name="ArrowUpRight" size={12} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}