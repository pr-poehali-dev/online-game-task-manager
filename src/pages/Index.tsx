import { useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '@/components/ui/icon';

type Priority = 'low' | 'medium' | 'high' | 'critical';
type ColumnId = 'todo' | 'progress' | 'done';
type ServerId = 'c4x1' | 'hfx3old' | 'hfnew';

interface Server {
  id: ServerId;
  label: string;
  color: string;
}

const servers: Server[] = [
  { id: 'c4x1', label: 'С4х1', color: '270 65% 65%' },
  { id: 'hfx3old', label: 'HFx3 old', color: '35 85% 58%' },
  { id: 'hfnew', label: 'HF new', color: '152 60% 48%' },
];

function serverMeta(id: ServerId) {
  return servers.find((s) => s.id === id)!;
}

interface Member {
  id: string;
  name: string;
  role: string;
  short: string;
  color: string;
}

interface Task {
  id: string;
  title: string;
  column: ColumnId;
  assignee: string;
  priority: Priority;
  tag: string;
  version?: string;
  server: ServerId;
}

interface Bug {
  id: string;
  title: string;
  priority: Priority;
  version: string;
  status: 'open' | 'fixing' | 'closed';
  server: ServerId;
}

const members: Member[] = [
  { id: 'prog2', name: 'Вы', role: 'Программист · Руководитель', short: 'РП', color: '152 60% 48%' },
  { id: 'prog1', name: 'Программист 1', role: 'Разработка', short: 'П1', color: '210 80% 60%' },
  { id: 'cm', name: 'Комьюнити-менеджер', role: 'Админ · Веб · Обновления', short: 'КМ', color: '270 65% 65%' },
  { id: 'smm', name: 'СММ', role: 'Соцсети · Баннеры · Розыгрыши', short: 'СМ', color: '330 70% 62%' },
  { id: 'support', name: 'Саппорт', role: 'Поддержка · Тестирование', short: 'СП', color: '35 85% 58%' },
  { id: 'mods', name: 'Модераторы', role: 'Новости · Игроки', short: 'МД', color: '190 70% 55%' },
];

const columns: { id: ColumnId; title: string; icon: string }[] = [
  { id: 'todo', title: 'To Do', icon: 'Circle' },
  { id: 'progress', title: 'In Progress', icon: 'Timer' },
  { id: 'done', title: 'Done', icon: 'CheckCircle2' },
];

const initialTasks: Task[] = [
  { id: 't1', title: 'Баланс нового рейд-босса «Владыка Бездны»', column: 'progress', assignee: 'prog1', priority: 'high', tag: 'Геймплей', version: 'v2.4.0', server: 'hfnew' },
  { id: 't2', title: 'Баннер к весеннему розыгрышу', column: 'todo', assignee: 'smm', priority: 'medium', tag: 'Контент', server: 'c4x1' },
  { id: 't3', title: 'Обновить лендинг под патч 2.4', column: 'todo', assignee: 'cm', priority: 'medium', tag: 'Веб', version: 'v2.4.0', server: 'hfnew' },
  { id: 't4', title: 'Тест системы гильдейских войн', column: 'progress', assignee: 'support', priority: 'high', tag: 'QA', version: 'v2.4.0', server: 'hfx3old' },
  { id: 't5', title: 'Оптимизация серверной части боёв', column: 'progress', assignee: 'prog2', priority: 'critical', tag: 'Бэкенд', server: 'hfx3old' },
  { id: 't6', title: 'Новость о начале ивента «Затмение»', column: 'done', assignee: 'mods', priority: 'low', tag: 'Новости', server: 'c4x1' },
  { id: 't7', title: 'Патчноут v2.3.5 в соцсети', column: 'done', assignee: 'smm', priority: 'medium', tag: 'Контент', version: 'v2.3.5', server: 'hfx3old' },
  { id: 't8', title: 'Настройка дропа с сезонных мобов', column: 'todo', assignee: 'prog1', priority: 'high', tag: 'Геймплей', server: 'hfnew' },
];

const bugs: Bug[] = [
  { id: 'b1', title: 'Вылет клиента при входе в подземелье', priority: 'critical', version: 'v2.3.5', status: 'fixing', server: 'hfnew' },
  { id: 'b2', title: 'Некорректный расчёт урона по площади', priority: 'high', version: 'v2.3.5', status: 'open', server: 'hfx3old' },
  { id: 'b3', title: 'Пропадает иконка гильдии в чате', priority: 'medium', version: 'v2.3.4', status: 'open', server: 'c4x1' },
  { id: 'b4', title: 'Дюп золота через торговлю', priority: 'critical', version: 'v2.3.5', status: 'fixing', server: 'hfx3old' },
  { id: 'b5', title: 'Опечатка в описании квеста', priority: 'low', version: 'v2.3.5', status: 'closed', server: 'c4x1' },
];

const versions = [
  { v: 'v2.4.0', name: 'Гильдейские войны', date: '15 июля', state: 'В разработке' },
  { v: 'v2.3.5', name: 'Ивент «Затмение»', date: '2 июля', state: 'На тестировании' },
  { v: 'v2.3.4', name: 'Правки баланса', date: '18 июня', state: 'Выпущено' },
];

const priorityMap: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: 'Критич.', color: '0 72% 62%', bg: '0 72% 55% / 0.15' },
  high: { label: 'Высокий', color: '35 90% 60%', bg: '35 85% 58% / 0.15' },
  medium: { label: 'Средний', color: '210 80% 62%', bg: '210 80% 60% / 0.15' },
  low: { label: 'Низкий', color: '152 50% 55%', bg: '152 50% 50% / 0.15' },
};

function member(id: string) {
  return members.find((m) => m.id === id)!;
}

export default function Index() {
  const [view, setView] = useState<'board' | 'bugs' | 'versions'>('board');
  const [server, setServer] = useState<ServerId | 'all'>('all');
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<ColumnId | null>(null);

  const filteredTasks = server === 'all' ? tasks : tasks.filter((t) => t.server === server);
  const filteredBugs = server === 'all' ? bugs : bugs.filter((b) => b.server === server);

  function handleAddTask(task: Task) {
    setTasks((prev) => [...prev, task]);
    setCreateFor(null);
  }

  function handleUpdateTask(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask(null);
  }

  function handleDeleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTask(null);
  }

  return (
    <div className="min-h-screen grid-bg text-foreground flex">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-border bg-card/60 backdrop-blur-sm hidden lg:flex flex-col p-5">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Icon name="Swords" size={22} className="text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-lg leading-none tracking-wide">AETHER</div>
            <div className="text-xs text-muted-foreground mt-1">Task Command</div>
          </div>
        </div>

        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Команда</div>
        <div className="space-y-1 flex-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ background: `hsl(${m.color} / 0.18)`, color: `hsl(${m.color})` }}
              >
                {m.short}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.role}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-secondary/50 border border-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-dot" />
            <span className="text-muted-foreground">Онлайн ветка</span>
            <span className="ml-auto font-mono text-primary">v2.4.0</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 border-b border-border flex items-center gap-4 px-6 bg-card/40 backdrop-blur-sm">
          <div>
            <h1 className="font-display text-xl tracking-wide leading-none">Панель проекта</h1>
            <p className="text-xs text-muted-foreground mt-1">MMORPG «Aether Online»</p>
          </div>
          <nav className="ml-6 hidden md:flex gap-1 bg-secondary/60 p-1 rounded-lg">
            {[
              { k: 'board', label: 'Доска', icon: 'LayoutGrid' },
              { k: 'bugs', label: 'Баги', icon: 'Bug' },
              { k: 'versions', label: 'Версии', icon: 'GitBranch' },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k as typeof view)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === t.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button className="h-9 w-9 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors relative">
              <Icon name="Bell" size={17} />
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-destructive" />
            </button>
            <button
              onClick={() => setCreateFor('todo')}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Icon name="Plus" size={16} />
              <span className="hidden sm:inline">Задача</span>
            </button>
          </div>
        </header>

        {view !== 'versions' && (
          <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-card/20 overflow-x-auto scrollbar-thin">
            <span className="text-xs uppercase tracking-widest text-muted-foreground mr-1 shrink-0">
              <Icon name="Server" size={13} className="inline mr-1.5 -mt-0.5" />
              Сервер
            </span>
            <button
              onClick={() => setServer('all')}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                server === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Все
            </button>
            {servers.map((s) => {
              const active = server === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setServer(s.id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all shrink-0 flex items-center gap-1.5 border"
                  style={{
                    background: active ? `hsl(${s.color} / 0.18)` : 'transparent',
                    borderColor: active ? `hsl(${s.color} / 0.5)` : 'hsl(var(--border))',
                    color: active ? `hsl(${s.color})` : 'hsl(var(--muted-foreground))',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${s.color})` }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 scrollbar-thin">
          {view === 'board' && (
            <Board
              tasks={filteredTasks}
              onCardClick={setSelectedTask}
              onAddClick={setCreateFor}
            />
          )}
          {view === 'bugs' && <Bugs bugs={filteredBugs} />}
          {view === 'versions' && <Versions />}
        </div>
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}
      {createFor && (
        <CreateTaskModal
          column={createFor}
          onClose={() => setCreateFor(null)}
          onCreate={handleAddTask}
        />
      )}
    </div>
  );
}

function PriorityBadge({ p }: { p: Priority }) {
  const meta = priorityMap[p];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md"
      style={{ background: `hsl(${meta.bg})`, color: `hsl(${meta.color})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${meta.color})` }} />
      {meta.label}
    </span>
  );
}

function Board({
  tasks,
  onCardClick,
  onAddClick,
}: {
  tasks: Task[];
  onCardClick: (t: Task) => void;
  onAddClick: (col: ColumnId) => void;
}) {
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
                const m = member(t.assignee);
                return (
                  <div
                    key={t.id}
                    onClick={() => onCardClick(t)}
                    className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all cursor-pointer animate-scale-in"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">{t.tag}</span>
                        <ServerBadge id={t.server} />
                      </div>
                      <PriorityBadge p={t.priority} />
                    </div>
                    <p className="text-sm font-medium leading-snug mb-3">{t.title}</p>
                    <div className="flex items-center justify-between">
                      <div
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-semibold"
                        style={{ background: `hsl(${m.color} / 0.18)`, color: `hsl(${m.color})` }}
                        title={m.name}
                      >
                        {m.short}
                      </div>
                      {t.version && (
                        <span className="text-xs font-mono text-primary flex items-center gap-1">
                          <Icon name="Tag" size={11} />
                          {t.version}
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

function ServerBadge({ id }: { id: ServerId }) {
  const s = serverMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
      style={{ background: `hsl(${s.color} / 0.15)`, color: `hsl(${s.color})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${s.color})` }} />
      {s.label}
    </span>
  );
}

function Bugs({ bugs: list }: { bugs: Bug[] }) {
  const statusMeta: Record<Bug['status'], { label: string; color: string }> = {
    open: { label: 'Открыт', color: '35 85% 58%' },
    fixing: { label: 'В работе', color: '210 80% 60%' },
    closed: { label: 'Закрыт', color: '152 50% 50%' },
  };
  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="Bug" size={20} className="text-destructive" />
        <h2 className="font-display tracking-wide text-lg">Трекер ошибок</h2>
        <span className="text-sm text-muted-foreground">· {list.filter((b) => b.status !== 'closed').length} активных</span>
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          На выбранном сервере ошибок нет
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {list.map((b, i) => {
            const st = statusMeta[b.status];
            return (
              <div
                key={b.id}
                className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="font-mono text-xs text-muted-foreground w-10">{b.id.toUpperCase()}</span>
                <PriorityBadge p={b.priority} />
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{b.title}</span>
                <span className="hidden md:block">
                  <ServerBadge id={b.server} />
                </span>
                <span className="text-xs font-mono text-primary hidden sm:block">{b.version}</span>
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-md shrink-0"
                  style={{ background: `hsl(${st.color} / 0.15)`, color: `hsl(${st.color})` }}
                >
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TaskModal({ task, onClose, onSave, onDelete }: {
  task: Task;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<Task>({ ...task });
  const set = (k: keyof Task, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display tracking-wide text-lg">Задача</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <Icon name="X" size={20} />
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Колонка" value={form.column} onChange={(v) => set('column', v)} options={[
            { value: 'todo', label: 'To Do' },
            { value: 'progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Исполнитель" value={form.assignee} onChange={(v) => set('assignee', v)} options={
            members.map((m) => ({ value: m.id, label: m.name }))
          } />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input
              value={form.tag}
              onChange={(e) => set('tag', e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Версия</label>
            <input
              value={form.version ?? ''}
              onChange={(e) => set('version', e.target.value)}
              placeholder="v2.4.0"
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => onDelete(task.id)}
          className="h-9 px-4 rounded-lg border border-destructive/40 text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          Удалить
        </button>
        <button
          onClick={() => onSave(form)}
          className="ml-auto h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Сохранить
        </button>
      </div>
    </ModalOverlay>
  );
}

function CreateTaskModal({ column, onClose, onCreate }: {
  column: ColumnId;
  onClose: () => void;
  onCreate: (t: Task) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    column,
    assignee: 'prog2',
    priority: 'medium' as Priority,
    tag: '',
    version: '',
    server: 'hfnew' as ServerId,
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function handleCreate() {
    if (!form.title.trim()) return;
    onCreate({
      ...form,
      id: 't' + Date.now(),
      version: form.version || undefined,
    } as Task);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display tracking-wide text-lg">Новая задача</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <Icon name="X" size={20} />
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Опишите задачу..."
            className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Колонка" value={form.column} onChange={(v) => set('column', v)} options={[
            { value: 'todo', label: 'To Do' },
            { value: 'progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Исполнитель" value={form.assignee} onChange={(v) => set('assignee', v)} options={
            members.map((m) => ({ value: m.id, label: m.name }))
          } />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input
              value={form.tag}
              onChange={(e) => set('tag', e.target.value)}
              placeholder="Геймплей, Контент..."
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Версия</label>
            <input
              value={form.version}
              onChange={(e) => set('version', e.target.value)}
              placeholder="v2.4.0"
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
          Отмена
        </button>
        <button
          onClick={handleCreate}
          disabled={!form.title.trim()}
          className="ml-auto h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Создать
        </button>
      </div>
    </ModalOverlay>
  );
}

function Versions() {
  const stateColor: Record<string, string> = {
    'В разработке': '210 80% 60%',
    'На тестировании': '35 85% 58%',
    'Выпущено': '152 55% 50%',
  };
  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Icon name="GitBranch" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">История обновлений</h2>
      </div>
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
        {versions.map((v, i) => (
          <div key={v.v} className="relative mb-6 last:mb-0 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-lg text-primary">{v.v}</span>
                <span className="text-xs text-muted-foreground">{v.date}</span>
                <span
                  className="ml-auto text-xs font-medium px-2.5 py-1 rounded-md"
                  style={{ background: `hsl(${stateColor[v.state]} / 0.15)`, color: `hsl(${stateColor[v.state]})` }}
                >
                  {v.state}
                </span>
              </div>
              <p className="text-sm font-medium">{v.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}