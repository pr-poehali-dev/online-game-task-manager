import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, Sprint } from './shared';
import { taskAssigneeIds, resolveAssignee, servers, categories, CategoryBadge, DeadlineBadge, AssigneeAvatar, Select, formatMskDateTime } from './shared';
import { AssigneeMultiSelect, KbMultiSelect } from './TaskModalShared';

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
  deadlineLocal: string;
  setDeadlineLocal: (v: string) => void;
}) {
  return (
    <>
      {/* Title */}
      <div>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          readOnly={!isEditing || !canFullEdit}
          className="w-full bg-transparent text-lg font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1 transition-colors"
          placeholder="Название задачи"
        />
      </div>

      {/* Creation meta: дата создания по МСК + автор */}
      {(task.createdAt || task.creatorId != null) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground -mt-3">
          {task.createdAt && (
            <span className="flex items-center gap-1">
              <Icon name="Calendar" size={11} />
              Создана {formatMskDateTime(task.createdAt)}
            </span>
          )}
          {task.creatorId != null && (
            <span className="flex items-center gap-1">
              <AssigneeAvatar a={resolveAssignee(team, task.creatorId)} size={15} />
              {resolveAssignee(team, task.creatorId).name}
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
            <Select compact label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
              servers.map((s) => ({ value: s.id, label: s.label }))
            } />
            <Select compact label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
              categories.map((c) => ({ value: c.id, label: c.label }))
            } />
            <AssigneeMultiSelect compact team={team} value={taskAssigneeIds(form)} onChange={setAssignees} />
            <Select compact label="Спринт" value={form.sprintId ?? ''} onChange={(v) => set('sprintId', v)} options={[
              { value: '', label: '— Без спринта —' },
              ...sprints.filter((s) => s.status !== 'done' || s.id === form.sprintId).map((s) => ({ value: s.id, label: s.title })),
            ]} />
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Дедлайн (МСК)</label>
              <input
                type="datetime-local"
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="md:col-span-4">
              <KbMultiSelect compact articles={kbArticles} value={form.kbArticleIds ?? []} onChange={setKbIds} />
            </div>
          </>
        ) : (
          <div className="col-span-2 md:col-span-4 rounded-lg border border-border bg-secondary/20 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Категория</span>
              <CategoryBadge id={form.category} />
            </div>
            {task.deadline && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Дедлайн</span>
                <DeadlineBadge iso={task.deadline} />
              </div>
            )}
            {form.sprintId && sprints.find((s) => s.id === form.sprintId) && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Спринт</span>
                <span className="text-xs font-medium text-foreground">{sprints.find((s) => s.id === form.sprintId)?.title}</span>
              </div>
            )}
            {taskAssigneeIds(form).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Исполнители</span>
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
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary/40 hover:border-primary/50 hover:text-primary transition-colors"
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
