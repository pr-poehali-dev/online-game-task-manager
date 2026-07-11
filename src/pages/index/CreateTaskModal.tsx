import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, Priority, ServerId, CategoryId, Sprint, ColumnId } from './shared';
import { servers, categories, Select, ModalOverlay, inputCls } from './shared';
import { AssigneeMultiSelect, KbMultiSelect } from './TaskModalShared';

export default function CreateTaskModal({ column, team, kbArticles, preset, onClose, onCreate, sprints }: {
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
