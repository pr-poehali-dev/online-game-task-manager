import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import func2url from '../../backend/func2url.json';

const AUTH_URL = (func2url as Record<string, string>).auth;
const TASKS_URL = (func2url as Record<string, string>).tasks;
const TOKEN_KEY = 'era_auth_token';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

interface TeamMember {
  id: number;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  tg_username: string | null;
  specialization: string | null;
  pending: boolean;
  online: boolean;
}

const AVATAR_HUES = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%'];

function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function initials(first: string, last: string | null): string {
  const a = (first || '').trim();
  const b = (last || '').trim();
  if (a && b) return (a[0] + b[0]).toUpperCase();
  return (a.slice(0, 2) || '?').toUpperCase();
}

interface AssigneeView {
  name: string;
  short: string;
  color: string;
  photo_url: string | null;
}

function resolveAssignee(team: TeamMember[], id: number | null): AssigneeView {
  const m = id != null ? team.find((t) => t.id === id) : undefined;
  if (!m) {
    return { name: 'Не назначен', short: '—', color: '215 15% 50%', photo_url: null };
  }
  return {
    name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
    short: initials(m.first_name, m.last_name),
    color: hueFor(m.tg_username || m.first_name || String(m.id)),
    photo_url: m.photo_url,
  };
}

type Priority = 'low' | 'medium' | 'high' | 'critical';
type ColumnId = 'todo' | 'progress' | 'done';
type ServerId = 'c4x1' | 'hfx3old' | 'hfnew';
type CategoryId = 'web' | 'launcher' | 'client' | 'social' | 'ads' | 'server-ext' | 'server-scripts' | 'other';
type DeployStatus = 'none' | 'local' | 'test' | 'ready_live' | 'needs_test' | 'tested_ok' | 'tested_rework' | 'unfeasible';
type TaskOutcome = 'done' | 'unfeasible' | 'cancelled';

interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

const deployStatuses: { id: DeployStatus; label: string; color: string; icon: string }[] = [
  { id: 'none',          label: 'Без статуса',                   color: '215 15% 50%', icon: 'Minus' },
  { id: 'local',         label: 'Готово локально у скриптера',   color: '270 65% 65%', icon: 'Code2' },
  { id: 'test',          label: 'Залито на тестовый',            color: '210 80% 62%', icon: 'FlaskConical' },
  { id: 'ready_live',    label: 'Можно заливать на лайв',        color: '45 90% 55%',  icon: 'Rocket' },
  { id: 'needs_test',    label: 'Требуется тест',                color: '35 85% 58%',  icon: 'ClipboardCheck' },
  { id: 'tested_ok',     label: 'Протестировано — всё ок',       color: '152 55% 50%', icon: 'CircleCheck' },
  { id: 'tested_rework', label: 'На доработку (есть замечания)', color: '0 65% 60%',   icon: 'CircleX' },
  { id: 'unfeasible',    label: 'Нереализуемо',                  color: '0 0% 55%',    icon: 'Ban' },
];

const outcomes: { id: TaskOutcome; label: string; color: string; icon: string }[] = [
  { id: 'done',       label: 'Реализовано',   color: '152 55% 50%', icon: 'CircleCheck' },
  { id: 'unfeasible', label: 'Нереализуемо',  color: '0 0% 55%',    icon: 'Ban' },
  { id: 'cancelled',  label: 'Отменено',      color: '0 65% 60%',   icon: 'XCircle' },
];

function outcomeMeta(id: TaskOutcome) {
  return outcomes.find((o) => o.id === id) ?? outcomes[0];
}

interface Server {
  id: ServerId;
  label: string;
  color: string;
}

interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
}

const servers: Server[] = [
  { id: 'c4x1', label: 'С4х1', color: '270 65% 65%' },
  { id: 'hfx3old', label: 'HFx3 old', color: '35 85% 58%' },
  { id: 'hfnew', label: 'HF new', color: '152 60% 48%' },
];

const categories: Category[] = [
  { id: 'web', label: 'Веб', icon: 'Globe', color: '210 80% 62%' },
  { id: 'launcher', label: 'Лаунчер', icon: 'MonitorDown', color: '270 65% 65%' },
  { id: 'client', label: 'Клиент', icon: 'Gamepad2', color: '35 85% 58%' },
  { id: 'social', label: 'Соцсети и форум', icon: 'MessagesSquare', color: '330 70% 62%' },
  { id: 'ads', label: 'Реклама', icon: 'Megaphone', color: '45 90% 55%' },
  { id: 'server-ext', label: 'Сервер · Экст', icon: 'Database', color: '0 65% 60%' },
  { id: 'server-scripts', label: 'Сервер · Скрипты', icon: 'Code2', color: '152 55% 50%' },
  { id: 'other', label: 'Прочее', icon: 'MoreHorizontal', color: '215 15% 55%' },
];

function serverMeta(id: ServerId) {
  return servers.find((s) => s.id === id)!;
}

function categoryMeta(id: CategoryId) {
  return categories.find((c) => c.id === id) ?? categories[categories.length - 1];
}

interface Task {
  id: string;
  title: string;
  column: ColumnId;
  assigneeId: number | null;
  priority: Priority;
  tag: string;
  version?: string;
  server: ServerId;
  description?: string;
  links?: { url: string; label: string }[];
  category: CategoryId;
  sprintId?: string;
  deployStatus?: DeployStatus;
  comments?: Comment[];
  archived?: boolean;
  outcome?: TaskOutcome | null;
}

interface Bug {
  id: string;
  title: string;
  priority: Priority;
  version: string;
  status: 'open' | 'fixing' | 'closed';
  server: ServerId;
}

interface Sprint {
  id: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'planned' | 'done';
}

const columns: { id: ColumnId; title: string; icon: string }[] = [
  { id: 'todo', title: 'To Do', icon: 'Circle' },
  { id: 'progress', title: 'In Progress', icon: 'Timer' },
  { id: 'done', title: 'Done', icon: 'CheckCircle2' },
];



const initialSprints: Sprint[] = [
  {
    id: 's1',
    title: 'Спринт 1 · Старт проекта',
    goal: 'Запустить базовые системы: античит, лаунчер, лендинг',
    startDate: '2025-06-23',
    endDate: '2025-07-06',
    status: 'done',
  },
  {
    id: 's2',
    title: 'Спринт 2 · Ивент «Затмение»',
    goal: 'Подготовить ивент, обновить соцсети и сайт под патч 2.4',
    startDate: '2025-07-07',
    endDate: '2025-07-20',
    status: 'active',
  },
  {
    id: 's3',
    title: 'Спринт 3 · Гильдейские войны',
    goal: 'Релиз системы гильдейских войн и рекламная кампания',
    startDate: '2025-07-21',
    endDate: '2025-08-03',
    status: 'planned',
  },
];

const bugs: Bug[] = [
  { id: 'b1', title: 'Вылет клиента при входе в подземелье', priority: 'critical', version: 'v2.3.5', status: 'fixing', server: 'hfnew' },
  { id: 'b2', title: 'Некорректный расчёт урона по площади', priority: 'high', version: 'v2.3.5', status: 'open', server: 'hfx3old' },
  { id: 'b3', title: 'Пропадает иконка гильдии в чате', priority: 'medium', version: 'v2.3.4', status: 'open', server: 'c4x1' },
  { id: 'b4', title: 'Дюп золота через торговлю', priority: 'critical', version: 'v2.3.5', status: 'fixing', server: 'hfx3old' },
  { id: 'b5', title: 'Опечатка в описании квеста', priority: 'low', version: 'v2.3.5', status: 'closed', server: 'c4x1' },
];

const priorityMap: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: 'Критич.', color: '0 72% 62%', bg: '0 72% 55% / 0.15' },
  high: { label: 'Высокий', color: '35 90% 60%', bg: '35 85% 58% / 0.15' },
  medium: { label: 'Средний', color: '210 80% 62%', bg: '210 80% 60% / 0.15' },
  low: { label: 'Низкий', color: '152 50% 55%', bg: '152 50% 50% / 0.15' },
};

export default function Index() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState<'board' | 'bugs' | 'sprints' | 'archive'>('board');
  const [server, setServer] = useState<ServerId | 'all'>('all');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sprintFilter, setSprintFilter] = useState<string | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<TaskOutcome | 'all'>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>(initialSprints);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<ColumnId | null>(null);
  const [createSprint, setCreateSprint] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadTeam = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'team' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTeam(data.members || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(TASKS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
      /* ignore */
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
    loadTasks();
    const t = setInterval(loadTeam, 30000);
    return () => clearInterval(t);
  }, [loadTeam, loadTasks]);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);
  const filteredTasks = activeTasks
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category)
    .filter((t) => sprintFilter === 'all' || t.sprintId === sprintFilter);
  const filteredArchive = archivedTasks
    .filter((t) => outcomeFilter === 'all' || (t.outcome ?? 'done') === outcomeFilter)
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category);
  const filteredBugs = server === 'all' ? bugs : bugs.filter((b) => b.server === server);

  async function handleAddTask(task: Task) {
    setCreateFor(null);
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', ...task }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, data.task]);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleUpdateTask(updated: Task) {
    setSelectedTask(null);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update', ...updated }),
      });
    } catch {
      /* ignore */
    }
  }

  function handleDeleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setSelectedTask(null);
    setTasks((prev) => prev.filter((t) => t.id !== id));

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await fetch(TASKS_URL, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'delete', id }),
        });
      } catch {
        /* ignore */
      }
    }, 5000);

    toast(`Задача удалена`, {
      description: task.title,
      duration: 5000,
      action: {
        label: 'Восстановить',
        onClick: () => {
          cancelled = true;
          clearTimeout(timer);
          setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, task]));
        },
      },
    });
  }

  async function handleArchiveTask(id: string, outcome: TaskOutcome) {
    const task = tasks.find((t) => t.id === id);
    setSelectedTask(null);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true, outcome } : t)));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'archive', id, outcome }),
      });
    } catch {
      /* ignore */
    }
    toast(`Задача в архиве · ${outcomeMeta(outcome).label}`, {
      description: task?.title,
      action: { label: 'Отменить', onClick: () => handleUnarchiveTask(id) },
    });
  }

  async function handleUnarchiveTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: false, outcome: null } : t)));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'unarchive', id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function handleDeleteArchivedTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
    } catch {
      /* ignore */
    }
    toast(`Задача удалена окончательно`, { description: task?.title });
  }

  return (
    <div className="min-h-screen grid-bg text-foreground flex">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-border bg-card/60 backdrop-blur-sm hidden lg:flex flex-col">
        {/* Logo — L2 style */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(35 85% 40%), hsl(45 90% 55%))' }}>
              <Icon name="Swords" size={20} className="text-black/80" />
            </div>
            <div>
              <div className="font-display text-xl leading-none tracking-widest text-foreground" style={{ letterSpacing: '0.18em' }}>ЭРА</div>
              <div className="text-xs text-muted-foreground mt-0.5 tracking-wide">Task Command</div>
            </div>
          </div>
        </div>

        {/* Categories nav */}
        <div className="px-4 pt-4 pb-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-1">Категории</div>
          <div className="space-y-0.5">
            <button
              onClick={() => setCategory('all')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${category === 'all' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
            >
              <Icon name="LayoutGrid" size={14} />
              Все задачи
              <span className="ml-auto text-xs font-mono opacity-60">{tasks.length}</span>
            </button>
            {categories.map((cat) => {
              const count = tasks.filter((t) => t.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    background: category === cat.id ? `hsl(${cat.color} / 0.12)` : 'transparent',
                    color: category === cat.id ? `hsl(${cat.color})` : 'hsl(var(--muted-foreground))',
                    fontWeight: category === cat.id ? 500 : 400,
                  }}
                >
                  <Icon name={cat.icon} size={14} />
                  {cat.label}
                  <span className="ml-auto text-xs font-mono opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 pt-3 pb-2 mt-auto">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            Команда
            <span className="text-[10px] font-mono opacity-60">
              {team.filter((m) => m.online).length}/{team.length} онлайн
            </span>
          </div>
          <div className="space-y-0.5">
            {team.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-1.5">Пока никого нет</div>
            )}
            {team.map((m) => {
              const hue = hueFor(m.tg_username || m.first_name || String(m.id));
              const displayName = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
              const tg = (m.tg_username || '').replace('@', '');
              const openTasks = tasks.filter((t) => t.assigneeId === m.id && t.column !== 'done').length;
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors group">
                  <div className="relative shrink-0">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                    ) : (
                      <div
                        className="h-7 w-7 rounded-md flex items-center justify-center text-xs font-semibold"
                        style={{ background: `hsl(${hue} / 0.18)`, color: `hsl(${hue})` }}
                      >
                        {initials(m.first_name, m.last_name)}
                      </div>
                    )}
                    <span
                      title={m.pending ? 'Ожидает входа' : m.online ? 'Онлайн' : 'Оффлайн'}
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${m.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground truncate" style={{ fontSize: '10px' }}>
                      {m.specialization || (m.role === 'admin' ? 'Администратор' : 'Участник')}
                    </div>
                  </div>
                  {openTasks > 0 && (
                    <span
                      title={`Открытых задач: ${openTasks}`}
                      className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center group-hover:opacity-0 transition-opacity"
                    >
                      {openTasks}
                    </span>
                  )}
                  {tg && (
                    <a
                      href={`https://t.me/${tg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Написать ${displayName} в Telegram`}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    >
                      <Icon name="Send" size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center gap-4 px-6 bg-card/40 backdrop-blur-sm"
          style={{ borderBottom: '1px solid hsl(var(--border))', boxShadow: '0 1px 0 hsl(35 85% 45% / 0.08)' }}>
          <div className="flex items-center gap-2">
            <span className="font-display tracking-widest text-base" style={{ letterSpacing: '0.12em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="text-sm text-muted-foreground">
              {view === 'board' && 'Доска задач'}
              {view === 'bugs' && 'Трекер ошибок'}
              {view === 'sprints' && 'Спринты'}
              {view === 'archive' && 'Архив задач'}
            </span>
          </div>
          <nav className="ml-4 hidden md:flex gap-1 bg-secondary/60 p-1 rounded-lg">
            {[
              { k: 'board', label: 'Доска', icon: 'LayoutGrid' },
              { k: 'bugs', label: 'Баги', icon: 'Bug' },
              { k: 'sprints', label: 'Спринты', icon: 'Zap' },
              { k: 'archive', label: 'Архив', icon: 'Archive' },
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
          <div className="ml-auto flex items-center gap-2">
            {category !== 'all' && (
              <button
                onClick={() => setCategory('all')}
                className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{
                  borderColor: `hsl(${categoryMeta(category as CategoryId).color} / 0.4)`,
                  background: `hsl(${categoryMeta(category as CategoryId).color} / 0.1)`,
                  color: `hsl(${categoryMeta(category as CategoryId).color})`,
                }}
              >
                <Icon name={categoryMeta(category as CategoryId).icon} size={12} />
                {categoryMeta(category as CategoryId).label}
                <Icon name="X" size={11} />
              </button>
            )}
            <button className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors relative">
              <Icon name="Bell" size={16} />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
            </button>
            {user ? (
              <button
                onClick={() => navigate(isAdmin ? '/admin' : '/cabinet')}
                title={isAdmin ? 'Админка' : 'Личный кабинет'}
                className="h-8 px-2.5 rounded-lg bg-secondary/60 flex items-center gap-2 hover:bg-secondary transition-colors"
              >
                {user.photo_url ? (
                  <img src={user.photo_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <Icon name={isAdmin ? 'Shield' : 'User'} size={15} />
                )}
                <span className="hidden sm:inline text-sm">{user.first_name}</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="h-8 px-3 rounded-lg bg-secondary/60 flex items-center gap-2 hover:bg-secondary transition-colors text-sm"
              >
                <Icon name="LogIn" size={15} />
                <span className="hidden sm:inline">Войти</span>
              </button>
            )}
            {view === 'sprints' ? (
              <button
                onClick={() => setCreateSprint(true)}
                className="flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Icon name="Plus" size={15} />
                <span className="hidden sm:inline">Спринт</span>
              </button>
            ) : (
              <button
                onClick={() => setCreateFor('todo')}
                className="flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Icon name="Plus" size={15} />
                <span className="hidden sm:inline">Задача</span>
              </button>
            )}
          </div>
        </header>

        {/* Filter bar — server + sprint */}
        {(view === 'board' || view === 'bugs') && (
          <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border bg-card/10 overflow-x-auto scrollbar-thin">
            <Icon name="Server" size={12} className="text-muted-foreground shrink-0" />
            <button
              onClick={() => setServer('all')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 ${
                server === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              Все серверы
            </button>
            {servers.map((s) => {
              const active = server === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setServer(s.id)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md transition-all shrink-0 flex items-center gap-1.5 border"
                  style={{
                    background: active ? `hsl(${s.color} / 0.18)` : 'transparent',
                    borderColor: active ? `hsl(${s.color} / 0.4)` : 'hsl(var(--border))',
                    color: active ? `hsl(${s.color})` : 'hsl(var(--muted-foreground))',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${s.color})` }} />
                  {s.label}
                </button>
              );
            })}
            {view === 'board' && (
              <>
                <div className="w-px h-4 bg-border mx-1 shrink-0" />
                <Icon name="Zap" size={12} className="text-muted-foreground shrink-0" />
                <button
                  onClick={() => setSprintFilter('all')}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 ${
                    sprintFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  Все спринты
                </button>
                {sprints.map((sp) => {
                  const active = sprintFilter === sp.id;
                  const statusColor = sp.status === 'active' ? '152 55% 50%' : sp.status === 'planned' ? '210 80% 62%' : '215 15% 50%';
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSprintFilter(sp.id)}
                      className="text-xs font-medium px-2.5 py-1 rounded-md transition-all shrink-0 flex items-center gap-1.5 border"
                      style={{
                        background: active ? `hsl(${statusColor} / 0.18)` : 'transparent',
                        borderColor: active ? `hsl(${statusColor} / 0.4)` : 'hsl(var(--border))',
                        color: active ? `hsl(${statusColor})` : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {sp.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                      {sp.title}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 scrollbar-thin">
          {view === 'board' && (
            <Board
              tasks={filteredTasks}
              team={team}
              loading={tasksLoading}
              onCardClick={setSelectedTask}
              onAddClick={setCreateFor}
              onArchive={handleArchiveTask}
            />
          )}
          {view === 'bugs' && <Bugs bugs={filteredBugs} />}
          {view === 'sprints' && (
            <Sprints
              sprints={sprints}
              tasks={activeTasks}
              onUpdate={(updated) => setSprints((prev) => prev.map((s) => s.id === updated.id ? updated : s))}
              onDelete={(id) => setSprints((prev) => prev.filter((s) => s.id !== id))}
              onFilterBoard={(sprintId) => { setSprintFilter(sprintId); setView('board'); }}
            />
          )}
          {view === 'archive' && (
            <Archive
              tasks={filteredArchive}
              total={archivedTasks.length}
              team={team}
              outcomeFilter={outcomeFilter}
              onOutcomeFilter={setOutcomeFilter}
              onCardClick={setSelectedTask}
              onRestore={handleUnarchiveTask}
              onDelete={handleDeleteArchivedTask}
            />
          )}
        </div>
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          team={team}
          onClose={() => setSelectedTask(null)}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
          onArchive={handleArchiveTask}
          onUnarchive={handleUnarchiveTask}
          sprints={sprints}
        />
      )}
      {createFor && (
        <CreateTaskModal
          column={createFor}
          team={team}
          onClose={() => setCreateFor(null)}
          onCreate={handleAddTask}
          sprints={sprints}
        />
      )}
      {createSprint && (
        <CreateSprintModal
          onClose={() => setCreateSprint(false)}
          onCreate={(sp) => { setSprints((prev) => [...prev, sp]); setCreateSprint(false); }}
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

function DeployBadge({ status }: { status: DeployStatus }) {
  const ds = deployStatuses.find((d) => d.id === status) ?? deployStatuses[0];
  if (status === 'none') return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
      style={{
        background: `hsl(${ds.color} / 0.12)`,
        color: `hsl(${ds.color})`,
        borderColor: `hsl(${ds.color} / 0.3)`,
      }}
    >
      <Icon name={ds.icon} size={10} />
      {ds.label}
    </span>
  );
}

function CategoryBadge({ id }: { id: CategoryId }) {
  const c = categoryMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
      style={{ background: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}
    >
      <Icon name={c.icon} size={10} />
      {c.label}
    </span>
  );
}

function AssigneeAvatar({ a, size = 24 }: { a: AssigneeView; size?: number }) {
  if (a.photo_url) {
    return <img src={a.photo_url} alt={a.name} title={a.name} className="rounded-md object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
      style={{ width: size, height: size, background: `hsl(${a.color} / 0.18)`, color: `hsl(${a.color})` }}
      title={a.name}
    >
      {a.short}
    </div>
  );
}

function Board({
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
                const a = resolveAssignee(team, t.assigneeId);
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
                      <AssigneeAvatar a={a} size={24} />
                      <ServerBadge id={t.server} />
                      {t.comments && t.comments.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Icon name="MessageSquare" size={11} />
                          {t.comments.length}
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

function ModalOverlay({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-border bg-card animate-scale-in mb-8 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
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

const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

function TaskModal({ task, team, onClose, onSave, onDelete, onArchive, onUnarchive, sprints }: {
  task: Task;
  team: TeamMember[];
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
  const setAssignee = (v: string) => setForm((p) => ({ ...p, assigneeId: v ? Number(v) : null }));

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
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Исполнитель" value={form.assigneeId != null ? String(form.assigneeId) : ''} onChange={setAssignee} options={
            [{ value: '', label: 'Не назначен' }, ...team.map((m) => ({ value: String(m.id), label: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}` }))]
          } />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
          <Select label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
            categories.map((c) => ({ value: c.id, label: c.label }))
          } />
          <Select label="Спринт" value={form.sprintId ?? ''} onChange={(v) => set('sprintId', v)} options={[
            { value: '', label: '— Без спринта —' },
            ...sprints.map((s) => ({ value: s.id, label: s.title })),
          ]} />
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input value={form.tag} onChange={(e) => set('tag', e.target.value)} className={inputCls} placeholder="Геймплей..." />
          </div>
        </div>

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

function CreateTaskModal({ column, team, onClose, onCreate, sprints }: {
  column: ColumnId;
  team: TeamMember[];
  onClose: () => void;
  onCreate: (t: Task) => void;
  sprints: Sprint[];
}) {
  const activeSprint = sprints.find((s) => s.status === 'active');
  const [form, setForm] = useState({
    title: '',
    column,
    assigneeId: null as number | null,
    priority: 'medium' as Priority,
    tag: '',
    server: 'hfnew' as ServerId,
    category: 'other' as CategoryId,
    sprintId: activeSprint?.id ?? '',
    description: '',
  });
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setAssignee = (v: string) => setForm((p) => ({ ...p, assigneeId: v ? Number(v) : null }));

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
          ]} />
          <Select label="Приоритет" value={form.priority} onChange={(v) => set('priority', v)} options={[
            { value: 'critical', label: 'Критический' },
            { value: 'high', label: 'Высокий' },
            { value: 'medium', label: 'Средний' },
            { value: 'low', label: 'Низкий' },
          ]} />
          <Select label="Исполнитель" value={form.assigneeId != null ? String(form.assigneeId) : ''} onChange={setAssignee} options={
            [{ value: '', label: 'Не назначен' }, ...team.map((m) => ({ value: String(m.id), label: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}` }))]
          } />
          <Select label="Сервер" value={form.server} onChange={(v) => set('server', v)} options={
            servers.map((s) => ({ value: s.id, label: s.label }))
          } />
          <Select label="Категория" value={form.category} onChange={(v) => set('category', v)} options={
            categories.map((c) => ({ value: c.id, label: c.label }))
          } />
          <Select label="Спринт" value={form.sprintId} onChange={(v) => set('sprintId', v)} options={[
            { value: '', label: '— Без спринта —' },
            ...sprints.map((s) => ({ value: s.id, label: s.title })),
          ]} />
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Тег</label>
            <input value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Геймплей..." className={inputCls} />
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

function Archive({ tasks, total, team, outcomeFilter, onOutcomeFilter, onCardClick, onRestore, onDelete }: {
  tasks: Task[];
  total: number;
  team: TeamMember[];
  outcomeFilter: TaskOutcome | 'all';
  onOutcomeFilter: (o: TaskOutcome | 'all') => void;
  onCardClick: (t: Task) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="Archive" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Архив задач</h2>
        <span className="text-sm text-muted-foreground">· {total} в архиве</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Завершённые и закрытые задачи. Можно вернуть любую обратно на доску.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => onOutcomeFilter('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            outcomeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          Все
        </button>
        {outcomes.map((o) => {
          const active = outcomeFilter === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onOutcomeFilter(o.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
              style={{
                background: active ? `hsl(${o.color} / 0.18)` : 'transparent',
                borderColor: active ? `hsl(${o.color} / 0.5)` : 'hsl(var(--border))',
                color: active ? `hsl(${o.color})` : 'hsl(var(--muted-foreground))',
              }}
            >
              <Icon name={o.icon} size={12} />
              {o.label}
            </button>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Archive" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">В архиве пока пусто</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => {
            const a = resolveAssignee(team, t.assigneeId);
            const om = outcomeMeta(t.outcome ?? 'done');
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors group"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0"
                  style={{ background: `hsl(${om.color} / 0.15)`, color: `hsl(${om.color})` }}
                >
                  <Icon name={om.icon} size={12} />
                  {om.label}
                </span>
                <button onClick={() => onCardClick(t)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{categoryMeta(t.category).label} · {a.name}</div>
                </button>
                <AssigneeAvatar a={a} size={26} />
                {confirmId === t.id ? (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Удалить навсегда?</span>
                    <button
                      onClick={() => { setConfirmId(null); onDelete(t.id); }}
                      className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onRestore(t.id)}
                      title="Вернуть на доску"
                      className="shrink-0 h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="ArchiveRestore" size={13} />
                      <span className="hidden sm:inline">Вернуть</span>
                    </button>
                    <button
                      onClick={() => setConfirmId(t.id)}
                      title="Удалить навсегда"
                      className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sprints({ sprints, tasks, onUpdate, onDelete, onFilterBoard }: {
  sprints: Sprint[];
  tasks: Task[];
  onUpdate: (s: Sprint) => void;
  onDelete: (id: string) => void;
  onFilterBoard: (sprintId: string) => void;
}) {
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const statusMeta: Record<Sprint['status'], { label: string; color: string; icon: string }> = {
    active:  { label: 'Активный', color: '152 55% 50%', icon: 'Zap' },
    planned: { label: 'Запланирован', color: '210 80% 62%', icon: 'Clock' },
    done:    { label: 'Завершён', color: '215 15% 50%', icon: 'CheckCircle2' },
  };

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  const activeSprints = sprints.filter((s) => s.status !== 'done');
  const archivedSprints = sprints.filter((s) => s.status === 'done');

  function renderSprint(sp: Sprint, i: number) {
          const spTasks = tasks.filter((t) => t.sprintId === sp.id);
          const done = spTasks.filter((t) => t.column === 'done').length;
          const total = spTasks.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const sm = statusMeta[sp.status];

          return (
            <div
              key={sp.id}
              className="rounded-xl border border-border bg-card p-5 animate-fade-in transition-all hover:border-primary/30"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md"
                      style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}
                    >
                      {sp.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                      <Icon name={sm.icon} size={11} />
                      {sm.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sp.startDate)} — {formatDate(sp.endDate)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-base leading-tight">{sp.title}</h3>
                  {sp.goal && (
                    <p className="text-sm text-muted-foreground mt-1">{sp.goal}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => onFilterBoard(sp.id)}
                    title="Открыть на доске"
                    className="h-8 px-2.5 rounded-lg bg-secondary/60 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="LayoutGrid" size={13} />
                    Доска
                  </button>
                  <button
                    onClick={() => setEditing({ ...sp })}
                    className="h-8 w-8 rounded-lg bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
                  >
                    <Icon name="Pencil" size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(sp.id)}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                  >
                    <Icon name="Trash2" size={13} />
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100 ? 'hsl(152 55% 50%)' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                  {done}/{total} задач · {pct}%
                </span>
              </div>
            </div>
          );
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Icon name="Zap" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Спринты</h2>
        <span className="text-sm text-muted-foreground">· {activeSprints.length} активных</span>
      </div>

      <div className="space-y-4">
        {activeSprints.map((sp, i) => renderSprint(sp, i))}

        {activeSprints.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Активных спринтов нет — создай новый
          </div>
        )}
      </div>

      {archivedSprints.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <Icon name={showArchive ? 'ChevronDown' : 'ChevronRight'} size={16} />
            <Icon name="Archive" size={15} />
            Архив спринтов
            <span className="text-xs font-mono opacity-60">{archivedSprints.length}</span>
          </button>
          {showArchive && (
            <div className="space-y-4 opacity-80">
              {archivedSprints.map((sp, i) => renderSprint(sp, i))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <SprintEditModal
          sprint={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { onUpdate(updated); setEditing(null); }}
        />
      )}
    </div>
  );
}

function SprintEditModal({ sprint, onClose, onSave }: {
  sprint: Sprint;
  onClose: () => void;
  onSave: (s: Sprint) => void;
}) {
  const [form, setForm] = useState<Sprint>({ ...sprint });
  const set = (k: keyof Sprint, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <h2 className="font-display tracking-wide text-lg">Редактировать спринт</h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Цель спринта</label>
          <textarea value={form.goal} onChange={(e) => set('goal', e.target.value)} rows={2}
            className={inputCls + ' resize-none'} placeholder="Что должны сделать за этот спринт..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Начало</label>
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Конец</label>
            <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
          </div>
        </div>
        <Select label="Статус" value={form.status} onChange={(v) => set('status', v)} options={[
          { value: 'planned', label: 'Запланирован' },
          { value: 'active', label: 'Активный' },
          { value: 'done', label: 'Завершён' },
        ]} />
      </div>
      <div className="flex justify-end gap-3 px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        <button onClick={() => onSave(form)} className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Сохранить</button>
      </div>
    </ModalOverlay>
  );
}

function CreateSprintModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (s: Sprint) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const [form, setForm] = useState<Sprint>({
    id: 's' + Date.now(),
    title: '',
    goal: '',
    startDate: today,
    endDate: twoWeeks,
    status: 'planned',
  });
  const set = (k: keyof Sprint, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
        <h2 className="font-display tracking-wide text-lg">Новый спринт</h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Название</label>
          <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Спринт 4 · Летний ивент" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Цель спринта</label>
          <textarea value={form.goal} onChange={(e) => set('goal', e.target.value)} rows={2}
            className={inputCls + ' resize-none'} placeholder="Что должны сделать за этот спринт..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Начало</label>
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Конец</label>
            <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
          </div>
        </div>
        <Select label="Статус" value={form.status} onChange={(v) => set('status', v)} options={[
          { value: 'planned', label: 'Запланирован' },
          { value: 'active', label: 'Активный' },
          { value: 'done', label: 'Завершён' },
        ]} />
      </div>
      <div className="flex justify-end gap-3 px-6 pb-5">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        <button
          onClick={() => { if (form.title.trim()) onCreate(form); }}
          disabled={!form.title.trim()}
          className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Создать
        </button>
      </div>
    </ModalOverlay>
  );
}