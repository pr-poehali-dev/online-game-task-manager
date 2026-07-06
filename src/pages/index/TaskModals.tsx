import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import { useAuth } from '@/lib/auth';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, Comment, Priority, ServerId, CategoryId, TaskOutcome, Sprint, ColumnId } from './shared';
import { taskAssigneeIds, resolveAssignee, servers, categories, outcomes, outcomeMeta, deployStatuses, PriorityBadge, ServerBadge, AssigneeAvatar, Select, ModalOverlay, inputCls } from './shared';

function AssigneeMultiSelect({ team, value, onChange }: {
  team: TeamMember[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => team.find((m) => m.id === id))
    .filter(Boolean) as TeamMember[];

  return (
    <div className="md:col-span-2">
      <label className="block text-xs text-muted-foreground mb-1.5">Исполнители</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не назначен</span>}
        {selected.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs">
            {m.first_name}{m.last_name ? ' ' + m.last_name[0] + '.' : ''}
            <span
              onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
              className="hover:text-foreground cursor-pointer"
            >
              <Icon name="X" size={11} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-card p-1 max-h-52 overflow-auto scrollbar-thin">
          {team.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В команде пока никого нет</div>}
          {team.map((m) => {
            const active = value.includes(m.id);
            const name = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors"
              >
                <span className={`h-4 w-4 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                <AssigneeAvatar a={resolveAssignee(team, m.id)} size={20} />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KbMultiSelect({ articles, value, onChange }: {
  articles: KbArticleBrief[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => articles.find((a) => Number(a.id) === id))
    .filter(Boolean) as KbArticleBrief[];

  return (
    <div className="md:col-span-2">
      <label className="block text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Icon name="BookOpen" size={12} />
        Связанные статьи базы знаний
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не выбрано</span>}
        {selected.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs max-w-[200px]">
            <span className="truncate">{a.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); toggle(Number(a.id)); }}
              className="hover:text-foreground cursor-pointer shrink-0"
            >
              <Icon name="X" size={11} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-card p-1 max-h-52 overflow-auto scrollbar-thin">
          {articles.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В базе знаний пока нет статей</div>}
          {articles.map((a) => {
            const active = value.includes(Number(a.id));
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(Number(a.id))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors text-left"
              >
                <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                <span className="truncate">{a.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskModal({ task, team, kbArticles, onOpenArticle, onClose, onSave, onDelete, onArchive, onUnarchive, sprints }: {
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
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<Task>({ ...task });
  const [links, setLinks] = useState<{ url: string; label: string }[]>(task.links ?? []);
  const [comments, setComments] = useState<Comment[]>(task.comments ?? []);
  const [newComment, setNewComment] = useState('');
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const [archiveMenu, setArchiveMenu] = useState(false);
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

  function addComment() {
    if (!newComment.trim()) return;
    const c: Comment = {
      id: 'c' + Date.now(),
      authorId: user ? String(user.id) : '',
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, c]);
    setNewComment('');
  }

  function removeComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  function handleSave() {
    onSave({ ...form, links, comments });
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <PriorityBadge p={form.priority} />
          <ServerBadge id={form.server} />
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
          {task.archived ? (
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
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="h-8 px-3 rounded-lg border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 transition-colors"
          >
            Удалить
          </button>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Title */}
        <div>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1 transition-colors"
            placeholder="Название задачи"
          />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="Колонка" value={form.column} onChange={(v) => set('column', v)} options={[
            { value: 'todo', label: 'To Do' },
            { value: 'progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
            { value: 'restart', label: 'К рестарту' },
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
          <Select label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
            categories.map((c) => ({ value: c.id, label: c.label }))
          } />
          <AssigneeMultiSelect team={team} value={taskAssigneeIds(form)} onChange={setAssignees} />
          <Select label="Спринт" value={form.sprintId ?? ''} onChange={(v) => set('sprintId', v)} options={[
            { value: '', label: '— Без спринта —' },
            ...sprints.map((s) => ({ value: s.id, label: s.title })),
          ]} />
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input value={form.tag} onChange={(e) => set('tag', e.target.value)} className={inputCls} placeholder="Геймплей..." />
          </div>
          <div className="md:col-span-4">
            <KbMultiSelect articles={kbArticles} value={form.kbArticleIds ?? []} onChange={setKbIds} />
          </div>
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
          <label className="block text-xs text-muted-foreground mb-1.5">Описание</label>
          <RichEditor
            content={form.description ?? ''}
            onChange={(html) => setForm((p) => ({ ...p, description: html }))}
          />
        </div>

        {/* Deploy status */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Статус деплоя</label>
          <div className="flex flex-wrap gap-2">
            {deployStatuses.map((ds) => {
              const active = (form.deployStatus ?? 'none') === ds.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => setForm((p) => ({ ...p, deployStatus: ds.id }))}
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

        {/* Links */}
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
                  <button onClick={() => removeLink(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
        </div>

        {/* Comments */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <Icon name="MessageSquare" size={12} />
            Комментарии {comments.length > 0 && <span className="font-mono">({comments.length})</span>}
          </label>
          {comments.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {comments.map((c) => {
                const auth = resolveAssignee(team, c.authorId ? Number(c.authorId) : null);
                return (
                  <div key={c.id} className="flex gap-2.5 group">
                    <AssigneeAvatar a={auth} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium">{auth.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => removeComment(c.id)}
                          className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-xs"
                        >
                          <Icon name="X" size={12} />
                        </button>
                      </div>
                      <div className="text-sm bg-secondary/40 rounded-lg px-3 py-2 whitespace-pre-wrap">{c.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(); }}
              placeholder="Написать комментарий... (Ctrl+Enter для отправки)"
              rows={2}
              className={inputCls + ' resize-none flex-1'}
            />
            <button
              onClick={addComment}
              disabled={!newComment.trim()}
              className="h-9 self-end px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40 transition-colors shrink-0"
            >
              <Icon name="Send" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end px-6 pb-5">
        <button
          onClick={handleSave}
          className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Сохранить
        </button>
      </div>
    </ModalOverlay>
  );
}

export function CreateTaskModal({ column, team, kbArticles, preset, onClose, onCreate, sprints }: {
  column: ColumnId;
  team: TeamMember[];
  kbArticles: KbArticleBrief[];
  preset?: Partial<Task> | null;
  onClose: () => void;
  onCreate: (t: Task) => void;
  sprints: Sprint[];
}) {
  const activeSprint = sprints.find((s) => s.status === 'active');
  const [form, setForm] = useState({
    title: preset?.title ?? '',
    column,
    assigneeId: null as number | null,
    assigneeIds: [] as number[],
    kbArticleIds: [] as number[],
    priority: (preset?.priority ?? 'medium') as Priority,
    tag: preset?.tag ?? '',
    server: (preset?.server ?? 'hfnew') as ServerId,
    category: (preset?.category ?? 'other') as CategoryId,
    sprintId: activeSprint?.id ?? '',
    description: '',
  });
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setAssignees = (ids: number[]) => setForm((p) => ({ ...p, assigneeIds: ids, assigneeId: ids[0] ?? null }));
  const setKbIds = (ids: number[]) => setForm((p) => ({ ...p, kbArticleIds: ids }));

  function addLink() {
    if (!newLink.url.trim()) return;
    setLinks((p) => [...p, { url: newLink.url, label: newLink.label || newLink.url }]);
    setNewLink({ url: '', label: '' });
  }

  function handleCreate() {
    if (!form.title.trim()) return;
    onCreate({
      ...form,
      id: 't' + Date.now(),
      links,
    } as Task);
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <h2 className="font-display tracking-wide text-lg">Новая задача</h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        <input
          autoFocus
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Название задачи..."
          className="w-full bg-transparent text-lg font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1 transition-colors placeholder:text-muted-foreground/50"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="Колонка" value={form.column} onChange={(v) => set('column', v)} options={[
            { value: 'todo', label: 'To Do' },
            { value: 'progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
            { value: 'restart', label: 'К рестарту' },
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
          <Select label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
            categories.map((c) => ({ value: c.id, label: c.label }))
          } />
          <AssigneeMultiSelect team={team} value={form.assigneeIds} onChange={setAssignees} />
          <Select label="Спринт" value={form.sprintId} onChange={(v) => set('sprintId', v)} options={[
            { value: '', label: '— Без спринта —' },
            ...sprints.map((s) => ({ value: s.id, label: s.title })),
          ]} />
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Геймплей..." className={inputCls} />
          </div>
          <div className="md:col-span-4">
            <KbMultiSelect articles={kbArticles} value={form.kbArticleIds} onChange={setKbIds} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Описание</label>
          <RichEditor content={form.description} onChange={(html) => set('description', html)} />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-2">Ссылки</label>
          {links.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 group">
                  <Icon name="Link" size={13} className="text-primary shrink-0" />
                  <span className="text-sm text-primary truncate flex-1">{l.label}</span>
                  <button onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newLink.label} onChange={(e) => setNewLink((p) => ({ ...p, label: e.target.value }))} placeholder="Название (напр. Тикет #1234)" className={inputCls + ' flex-1'} />
            <input value={newLink.url} onChange={(e) => setNewLink((p) => ({ ...p, url: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="https://..." className={inputCls + ' flex-1'} />
            <button onClick={addLink} className="h-9 px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">
              <Icon name="Plus" size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
          Отмена
        </button>
        <button onClick={handleCreate} disabled={!form.title.trim()} className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity">
          Создать
        </button>
      </div>
    </ModalOverlay>
  );
}