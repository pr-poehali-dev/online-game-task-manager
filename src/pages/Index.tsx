import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import KnowledgeBase, { KNOWLEDGE_URL, kbAuthHeaders } from '@/components/KnowledgeBase';
import type { KbCategoryId, KbArticleBrief } from '@/components/KnowledgeBase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  authHeaders,
  AUTH_URL,
  TASKS_URL,
  TOKEN_KEY,
  taskAssigneeIds,
  resolveAssignee,
  outcomeMeta,
  categoryMeta,
  servers,
  categories,
  initialSprints,
  bugs,
  hueFor,
  initials,
} from './index/shared';
import type {
  TeamMember,
  Task,
  Sprint,
  Bug,
  ServerId,
  CategoryId,
  TaskOutcome,
  ColumnId,
} from './index/shared';
import Board from './index/Board';
import Restart from './index/Restart';
import Ideas from './index/Ideas';
import { TaskModal, CreateTaskModal } from './index/TaskModals';
import { Bugs, Archive, Sprints, CreateSprintModal } from './index/SprintsBugsArchive';

export default function Index() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState<'board' | 'bugs' | 'sprints' | 'archive' | 'knowledge' | 'restart' | 'ideas'>('board');
  const [server, setServer] = useState<ServerId | 'all'>('all');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sprintFilter, setSprintFilter] = useState<string | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<TaskOutcome | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>(initialSprints);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<ColumnId | null>(null);
  const [createPreset, setCreatePreset] = useState<Partial<Task> | null>(null);
  const [createSprint, setCreateSprint] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [kbArticles, setKbArticles] = useState<KbArticleBrief[]>([]);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

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

  const loadKbArticles = useCallback(async () => {
    try {
      const res = await fetch(KNOWLEDGE_URL, { method: 'GET', headers: kbAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKbArticles((data.articles || []).map((a: KbArticleBrief) => ({ id: a.id, title: a.title, category: a.category })));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadTeam();
    loadTasks();
    loadKbArticles();
    const t = setInterval(loadTeam, 30000);
    return () => clearInterval(t);
  }, [loadTeam, loadTasks, loadKbArticles]);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);
  const filteredTasks = activeTasks
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category)
    .filter((t) => sprintFilter === 'all' || (sprintFilter === 'none' ? !t.sprintId : t.sprintId === sprintFilter))
    .filter((t) => assigneeFilter === 'all' || taskAssigneeIds(t).includes(assigneeFilter));
  const filteredArchive = archivedTasks
    .filter((t) => outcomeFilter === 'all' || (t.outcome ?? 'done') === outcomeFilter)
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category);
  const filteredBugs = server === 'all' ? bugs : bugs.filter((b) => b.server === server);
  const myOpenCount = user
    ? activeTasks.filter((t) => t.column !== 'done' && taskAssigneeIds(t).includes(user.id)).length
    : 0;

  function handleOpenArticle(id: string) {
    setSelectedTask(null);
    setOpenArticleId(id);
    setView('knowledge');
  }

  function normalize(s: string) {
    return s.toLowerCase().replace(/[«»"'.,!?]/g, '').trim();
  }

  function handleBugClick(bug: Bug) {
    const bn = normalize(bug.title);
    const match = tasks.find((t) => {
      const tn = normalize(t.title);
      return tn === bn || tn.includes(bn) || bn.includes(tn);
    });
    if (match) {
      setSelectedTask(match);
    } else {
      setCreatePreset({
        title: bug.title,
        priority: bug.priority,
        server: bug.server,
        category: 'client',
        tag: 'Баг',
      });
      setCreateFor('todo');
    }
  }

  async function handleAddTask(task: Task) {
    setCreateFor(null);
    setCreatePreset(null);
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

  async function handleToRestart(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column: 'restart', restartDone: false } : t)));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'to_restart', id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function handleToggleRestartDone(id: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, restartDone: done } : t)));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'set_restart_done', id, done }),
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
              const openTasks = tasks.filter((t) => !t.archived && t.column !== 'done' && taskAssigneeIds(t).includes(m.id)).length;
              const filterActive = assigneeFilter === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => { setAssigneeFilter(filterActive ? 'all' : m.id); setView('board'); }}
                  title={filterActive ? 'Показать все задачи' : `Показать задачи: ${displayName}`}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors group cursor-pointer ${filterActive ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/50'}`}
                >
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
              {view === 'knowledge' && 'База знаний'}
              {view === 'restart' && 'К рестарту'}
              {view === 'ideas' && 'Идеи'}
            </span>
          </div>
          <nav className="ml-4 hidden md:flex gap-1 bg-secondary/60 p-1 rounded-lg">
            {[
              { k: 'board', label: 'Доска', icon: 'LayoutGrid' },
              { k: 'restart', label: 'К рестарту', icon: 'RotateCcw' },
              { k: 'bugs', label: 'Баги', icon: 'Bug' },
              { k: 'sprints', label: 'Спринты', icon: 'Zap' },
              { k: 'ideas', label: 'Идеи', icon: 'Lightbulb' },
              { k: 'knowledge', label: 'База знаний', icon: 'BookOpen' },
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
            {view === 'sprints' && (
              <button
                onClick={() => setCreateSprint(true)}
                className="flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Icon name="Plus" size={15} />
                <span className="hidden sm:inline">Спринт</span>
              </button>
            )}
            {view === 'board' && (
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
                {user && (
                  <>
                    <div className="w-px h-4 bg-border mx-1 shrink-0" />
                    <button
                      onClick={() => setAssigneeFilter(assigneeFilter === user.id ? 'all' : user.id)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1.5 ${
                        assigneeFilter === user.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                      }`}
                    >
                      <Icon name="UserCheck" size={12} />
                      Мои задачи
                      {myOpenCount > 0 && (
                        <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                          assigneeFilter === user.id ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-primary/20 text-primary'
                        }`}>
                          {myOpenCount}
                        </span>
                      )}
                    </button>
                  </>
                )}
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
                <button
                  onClick={() => setSprintFilter(sprintFilter === 'none' ? 'all' : 'none')}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1.5 ${
                    sprintFilter === 'none' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  Без спринта
                  <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${sprintFilter === 'none' ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                    {activeTasks.filter((t) => !t.sprintId).length}
                  </span>
                </button>
                {sprints.map((sp) => {
                  const active = sprintFilter === sp.id;
                  const count = activeTasks.filter((t) => t.sprintId === sp.id).length;
                  const statusColor = sp.status === 'active' ? '152 55% 50%' : sp.status === 'planned' ? '210 80% 62%' : '215 15% 50%';
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSprintFilter(active ? 'all' : sp.id)}
                      className="text-xs font-medium px-2.5 py-1 rounded-md transition-all shrink-0 flex items-center gap-1.5 border"
                      style={{
                        background: active ? `hsl(${statusColor} / 0.18)` : 'transparent',
                        borderColor: active ? `hsl(${statusColor} / 0.4)` : 'hsl(var(--border))',
                        color: active ? `hsl(${statusColor})` : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {sp.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                      {sp.title}
                      <span
                        className="min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                        style={{ background: active ? `hsl(${statusColor} / 0.25)` : 'hsl(var(--secondary))', color: active ? `hsl(${statusColor})` : 'hsl(var(--muted-foreground))' }}
                      >
                        {count}
                      </span>
                      {active && <Icon name="X" size={11} />}
                    </button>
                  );
                })}
                {assigneeFilter !== 'all' && (
                  <>
                    <div className="w-px h-4 bg-border mx-1 shrink-0" />
                    <button
                      onClick={() => setAssigneeFilter('all')}
                      title="Сбросить фильтр по исполнителю"
                      className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/40"
                    >
                      <Icon name="User" size={11} />
                      {resolveAssignee(team, assigneeFilter).name}
                      <Icon name="X" size={11} />
                    </button>
                  </>
                )}
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
          {view === 'bugs' && <Bugs bugs={filteredBugs} tasks={tasks} onBugClick={handleBugClick} />}
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
          {view === 'knowledge' && (
            <KnowledgeBase
              category={category as KbCategoryId | 'all'}
              initialArticleId={openArticleId}
              onConsumeInitial={() => setOpenArticleId(null)}
              authors={team.map((m) => ({
                id: m.id,
                name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
                photo_url: m.photo_url,
              }))}
            />
          )}
          {view === 'restart' && (
            <Restart
              tasks={tasks}
              team={team}
              loading={tasksLoading}
              onCardClick={setSelectedTask}
              onAddClick={() => setCreateFor('restart')}
              onToRestart={handleToRestart}
              onToggleDone={handleToggleRestartDone}
              onArchive={handleArchiveTask}
            />
          )}
          {view === 'ideas' && (
            <Ideas
              authors={team.map((m) => ({
                id: m.id,
                name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
                photo_url: m.photo_url,
              }))}
            />
          )}
        </div>
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          team={team}
          kbArticles={kbArticles}
          onOpenArticle={handleOpenArticle}
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
          kbArticles={kbArticles}
          preset={createPreset}
          onClose={() => { setCreateFor(null); setCreatePreset(null); }}
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