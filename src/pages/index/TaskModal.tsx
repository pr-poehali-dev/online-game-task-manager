import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import AttachmentsField, { AttachmentsList } from '@/components/AttachmentsField';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, TaskOutcome, Sprint, Attachment } from './shared';
import { taskAssigneeIds, resolveAssignee, servers, categories, outcomes, outcomeMeta, deployStatuses, columns, PriorityBadge, ServerBadge, CategoryBadge, DeadlineBadge, DeployBadge, AssigneeAvatar, Select, ModalOverlay, inputCls, formatMskDateTime, mskLocalToIso, isoToMskLocal, TASKS_URL, authHeaders } from './shared';
import { AssigneeMultiSelect, KbMultiSelect } from './TaskModalShared';
import TaskComments from './TaskComments';
import type { PermissionKey } from '@/lib/auth';

export default function TaskModal({ task, team, kbArticles, onOpenArticle, onClose, onSave, onDelete, onArchive, onUnarchive, sprints, isAdmin, can, currentUserId }: {
  task: Task;
  team: TeamMember[];
  kbArticles: KbArticleBrief[];
  onOpenArticle: (id: string) => void;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  onUnarchive: (id: string) => void;
  sprints: Sprint[];
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
}) {
  const [form, setForm] = useState<Task>({ ...task });
  const [links, setLinks] = useState<{ url: string; label: string }[]>(task.links ?? []);
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments ?? []);
  const [deadlineLocal, setDeadlineLocal] = useState(isoToMskLocal(task.deadline));
  const [archiveMenu, setArchiveMenu] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const isCreator = task.creatorId != null && task.creatorId === currentUserId;
  const isAssignee = currentUserId != null && taskAssigneeIds(task).includes(currentUserId);
  const canFullEdit = isAdmin || (can('task_edit_own') && isCreator);
  // Статус деплоя может менять автор задачи или назначенный исполнитель — даже без полного доступа
  const canEditDeploy = canFullEdit || isCreator || isAssignee;
  // Режим просмотра по умолчанию: чистое описание + прикреплённая информация, без полей редактирования.
  // Доступен переход в редактирование только если есть на это право (полное или хотя бы статус деплоя).
  const [editing, setEditing] = useState(false);
  const isEditing = editing && (canFullEdit || canEditDeploy);
  const set = (k: keyof Task, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setAssignees = (ids: number[]) => setForm((p) => ({ ...p, assigneeIds: ids, assigneeId: ids[0] ?? null }));
  const setKbIds = (ids: number[]) => setForm((p) => ({ ...p, kbArticleIds: ids }));

  function addLink() {
    if (!newLink.url.trim()) return;
    const updated = [...links, { url: newLink.url, label: newLink.label || newLink.url }];
    setLinks(updated);
    setNewLink({ url: '', label: '' });
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadImage(file: File): Promise<string> {
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const res = await fetch(TASKS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'upload_image', data: dataUrl, ext, contentType: file.type }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.url || '';
  }

  function cancelEdit() {
    setForm({ ...task });
    setLinks(task.links ?? []);
    setAttachments(task.attachments ?? []);
    setDeadlineLocal(isoToMskLocal(task.deadline));
    setEditing(false);
  }

  function handleSave() {
    if (!canFullEdit) {
      if (canEditDeploy) {
        // Без полного доступа автор/исполнитель может менять статус деплоя (и связанную с ним колонку)
        onSave({ ...task, column: form.column, deployStatus: form.deployStatus });
        setEditing(false);
        return;
      }
      // Без права полного редактирования — можно изменить только колонку (перенос по доске To Do / In Progress / Done)
      onSave({ ...task, column: form.column });
      setEditing(false);
      return;
    }
    onSave({ ...form, links, attachments, deadline: deadlineLocal ? mskLocalToIso(deadlineLocal) : null });
    setEditing(false);
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      {/* Header */}
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
              onClick={() => setEditing(true)}
              className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
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

      <div className="px-6 py-5 space-y-4">
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
            <>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Категория</label>
                <CategoryBadge id={form.category} />
              </div>
              {task.deadline && (
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Дедлайн</label>
                  <DeadlineBadge iso={task.deadline} />
                </div>
              )}
              {taskAssigneeIds(form).length > 0 && (
                <div className="md:col-span-2">
                  <label className="block text-[10px] text-muted-foreground mb-1">Исполнители</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {taskAssigneeIds(form).map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-secondary/60 px-1.5 py-0.5 text-xs">
                        <AssigneeAvatar a={resolveAssignee(team, id)} size={16} />
                        {resolveAssignee(team, id).name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {form.sprintId && sprints.find((s) => s.id === form.sprintId) && (
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Спринт</label>
                  <span className="text-xs">{sprints.find((s) => s.id === form.sprintId)?.title}</span>
                </div>
              )}
            </>
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

        {/* Description */}
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Описание</label>
          {isEditing && canFullEdit ? (
            <RichEditor
              content={form.description ?? ''}
              onChange={(html) => setForm((p) => ({ ...p, description: html }))}
              onImageUpload={uploadImage}
              large
            />
          ) : (
            <div
              className="kb-content rounded-xl border border-border bg-secondary/20 px-4 py-3 max-h-[32rem] overflow-y-auto scrollbar-thin"
              dangerouslySetInnerHTML={{ __html: form.description || '<p class="text-muted-foreground">Без описания</p>' }}
            />
          )}
        </div>

        {((isEditing && canFullEdit) || attachments.length > 0) && (
          /* Attachments — видно всем, у кого открыта задача; редактирование только при полном доступе и в режиме редактирования */
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Вложения</label>
            {isEditing && canFullEdit ? (
              <AttachmentsField attachments={attachments} onChange={setAttachments} uploadUrl={TASKS_URL} authHeaders={authHeaders} />
            ) : (
              <AttachmentsList attachments={attachments} />
            )}
          </div>
        )}

        {isEditing && canEditDeploy && (
          /* Deploy status — определяет колонку доски автоматически. Доступно автору, исполнителю и админу, только в режиме редактирования */
          <div>
            <button
              type="button"
              onClick={() => setDeployOpen((v) => !v)}
              className="w-full flex items-center gap-2 mb-2"
            >
              <Icon name="ChevronRight" size={14} className={`text-muted-foreground transition-transform ${deployOpen ? 'rotate-90' : ''}`} />
              <span className="text-xs text-muted-foreground">Статус деплоя</span>
              {(form.deployStatus ?? 'none') !== 'none' && !deployOpen && (
                <span className="ml-1"><DeployBadge status={form.deployStatus ?? 'none'} /></span>
              )}
            </button>
            {deployOpen && (
              <div className="space-y-3 animate-scale-in">
                {columns.map((col) => (
                  <div key={col.id}>
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <Icon name={col.icon} size={11} />
                      {col.title}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {deployStatuses.filter((ds) => ds.column === col.id).map((ds) => {
                        const active = (form.deployStatus ?? 'none') === ds.id;
                        return (
                          <button
                            key={ds.id}
                            onClick={() => { setForm((p) => ({ ...p, deployStatus: ds.id, column: ds.column })); setDeployOpen(false); }}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all"
                            style={{
                              background: active ? `hsl(${ds.color} / 0.18)` : 'transparent',
                              borderColor: active ? `hsl(${ds.color} / 0.5)` : 'hsl(var(--border))',
                              color: active ? `hsl(${ds.color})` : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            <Icon name={ds.icon} size={12} />
                            {ds.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!isEditing && canEditDeploy && (form.deployStatus ?? 'none') !== 'none' && (
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Статус деплоя</label>
            <DeployBadge status={form.deployStatus ?? 'none'} />
          </div>
        )}

        {((isEditing && canFullEdit) || links.length > 0) && (
          /* Links — видно всем, у кого открыта задача; редактирование только при полном доступе и в режиме редактирования */
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Ссылки</label>
            {links.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {links.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 group">
                    <Icon name="Link" size={13} className="text-primary shrink-0" />
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                      {l.label}
                    </a>
                    {isEditing && canFullEdit && (
                      <button onClick={() => removeLink(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                        <Icon name="X" size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isEditing && canFullEdit && (
              <div className="flex gap-2">
                <input
                  value={newLink.label}
                  onChange={(e) => setNewLink((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Название (напр. Тикет #1234)"
                  className={inputCls + ' flex-1'}
                />
                <input
                  value={newLink.url}
                  onChange={(e) => setNewLink((p) => ({ ...p, url: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addLink()}
                  placeholder="https://..."
                  className={inputCls + ' flex-1'}
                />
                <button
                  onClick={addLink}
                  className="h-9 px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
                >
                  <Icon name="Plus" size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Comments */}
        <TaskComments taskId={task.id} team={team} />
      </div>

      {/* Footer — кнопки сохранения/отмены видны только в режиме редактирования */}
      {isEditing && (
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={cancelEdit}
            className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Сохранить
          </button>
        </div>
      )}
    </ModalOverlay>
  );
}
