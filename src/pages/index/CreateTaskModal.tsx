import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import AttachmentsField from '@/components/AttachmentsField';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, Priority, ServerId, CategoryId, Sprint, ColumnId, DeployStatus, Attachment } from './shared';
import { servers, categories, deployStatuses, columns, Select, ModalOverlay, inputCls, TASKS_URL, authHeaders, mskLocalToIso } from './shared';
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
  const initialDeployStatus = (deployStatuses.find((ds) => ds.column === column)?.id ?? 'none') as DeployStatus;
  const [form, setForm] = useState({
    title: preset?.title ?? '',
    column,
    deployStatus: initialDeployStatus,
    assigneeId: null as number | null,
    assigneeIds: [] as number[],
    kbArticleIds: [] as number[],
    priority: (preset?.priority ?? 'medium') as Priority,
    server: (preset?.server ?? 'hfnew') as ServerId,
    category: (preset?.category ?? 'other') as CategoryId,
    sprintId: activeSprint?.id ?? '',
    description: '',
    deadline: '',
  });
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setAssignees = (ids: number[]) => setForm((p) => ({ ...p, assigneeIds: ids, assigneeId: ids[0] ?? null }));
  const setKbIds = (ids: number[]) => setForm((p) => ({ ...p, kbArticleIds: ids }));

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
      attachments,
      deadline: form.deadline ? mskLocalToIso(form.deadline) : null,
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

        {form.column === 'restart' ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-secondary/60 text-muted-foreground">
            <Icon name="RotateCcw" size={12} />
            К рестарту
          </div>
        ) : (
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Статус деплоя (определяет колонку)</label>
            <div className="space-y-3">
              {columns.map((col) => (
                <div key={col.id}>
                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Icon name={col.icon} size={11} />
                    {col.title}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {deployStatuses.filter((ds) => ds.column === col.id).map((ds) => {
                      const active = form.deployStatus === ds.id;
                      return (
                        <button
                          key={ds.id}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, deployStatus: ds.id, column: ds.column }))}
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
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            ...sprints.filter((s) => s.status !== 'done').map((s) => ({ value: s.id, label: s.title })),
          ]} />
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Дедлайн (МСК)</label>
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="md:col-span-4">
            <KbMultiSelect articles={kbArticles} value={form.kbArticleIds} onChange={setKbIds} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Описание</label>
          <RichEditor content={form.description} onChange={(html) => set('description', html)} onImageUpload={uploadImage} />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Вложения</label>
          <AttachmentsField attachments={attachments} onChange={setAttachments} uploadUrl={TASKS_URL} authHeaders={authHeaders} />
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