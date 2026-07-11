import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { KNOWLEDGE_URL, kbAuthHeaders } from '@/components/KnowledgeBase';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import {
  authHeaders,
  AUTH_URL,
  TASKS_URL,
  SPRINTS_URL,
  TOKEN_KEY,
  taskAssigneeIds,
  outcomeMeta,
} from './index/shared';
import type {
  TeamMember,
  Task,
  Sprint,
  ServerId,
  CategoryId,
  TaskOutcome,
  ColumnId,
  ViewId,
} from './index/shared';
import IndexSidebar from './index/IndexSidebar';
import IndexTopbar from './index/IndexTopbar';
import IndexMain from './index/IndexMain';

export default function Index() {
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState<ViewId>('board');
  const [server, setServer] = useState<ServerId | 'all'>('all');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sprintFilter, setSprintFilter] = useState<string | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<TaskOutcome | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<ColumnId | null>(null);
  const [createPreset, setCreatePreset] = useState<Partial<Task> | null>(null);
  const [createSprint, setCreateSprint] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [kbArticles, setKbArticles] = useState<KbArticleBrief[]>([]);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

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

  const loadSprints = useCallback(async () => {
    try {
      const res = await fetch(SPRINTS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSprints(data.sprints || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadTeam();
    loadTasks();
    loadKbArticles();
    loadSprints();
    const t = setInterval(loadTeam, 30000);
    return () => clearInterval(t);
  }, [loadTeam, loadTasks, loadKbArticles, loadSprints]);

  async function handleCreateSprint(sprint: Sprint) {
    try {
      const res = await fetch(SPRINTS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', ...sprint }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprints((prev) => [...prev, data.sprint]);
      } else {
        toast.error('Не удалось создать спринт');
      }
    } catch {
      toast.error('Не удалось создать спринт');
    }
    setCreateSprint(false);
  }

  async function handleUpdateSprint(sprint: Sprint) {
    const prevSprints = sprints;
    setSprints((prev) => prev.map((s) => (s.id === sprint.id ? sprint : s)));
    try {
      const res = await fetch(SPRINTS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update', ...sprint }),
      });
      if (!res.ok) {
        setSprints(prevSprints);
        toast.error('Не удалось сохранить спринт');
      }
    } catch {
      setSprints(prevSprints);
      toast.error('Не удалось сохранить спринт');
    }
  }

  async function handleDeleteSprint(id: string) {
    const prevSprints = sprints;
    setSprints((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(SPRINTS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (!res.ok) {
        setSprints(prevSprints);
        toast.error('Не удалось удалить спринт');
      }
    } catch {
      setSprints(prevSprints);
      toast.error('Не удалось удалить спринт');
    }
  }

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
  const myOpenCount = user
    ? activeTasks.filter((t) => t.column !== 'done' && t.column !== 'restart' && taskAssigneeIds(t).includes(user.id)).length
    : 0;

  function handleOpenArticle(id: string) {
    setSelectedTask(null);
    setOpenArticleId(id);
    setView('knowledge');
  }

  function handleOpenTaskById(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setView(task.column === 'restart' ? 'restart' : 'board');
      setSelectedTask(task);
    }
  }

  function handleOpenIdeaById(ideaId: string) {
    setSelectedTask(null);
    setOpenTopicId(ideaId);
    setView('ideas');
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
      <IndexSidebar
        view={view}
        category={category}
        setCategory={setCategory}
        kbArticles={kbArticles}
        tasks={tasks}
        team={team}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        setView={setView}
      />

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <IndexTopbar
          view={view}
          setView={setView}
          category={category}
          setCategory={setCategory}
          user={user}
          isAdmin={isAdmin}
          onOpenTaskById={handleOpenTaskById}
          onOpenIdeaById={handleOpenIdeaById}
          setCreateSprint={setCreateSprint}
          setCreateFor={setCreateFor}
          server={server}
          setServer={setServer}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          myOpenCount={myOpenCount}
          sprints={sprints}
          sprintFilter={sprintFilter}
          setSprintFilter={setSprintFilter}
          activeTasks={activeTasks}
          team={team}
        />

        <IndexMain
          view={view}
          filteredTasks={filteredTasks}
          team={team}
          tasksLoading={tasksLoading}
          setSelectedTask={setSelectedTask}
          setCreateFor={setCreateFor}
          handleArchiveTask={handleArchiveTask}
          sprints={sprints}
          activeTasks={activeTasks}
          handleUpdateSprint={handleUpdateSprint}
          handleDeleteSprint={handleDeleteSprint}
          setSprintFilter={setSprintFilter}
          setView={setView}
          filteredArchive={filteredArchive}
          archivedTasks={archivedTasks}
          outcomeFilter={outcomeFilter}
          setOutcomeFilter={setOutcomeFilter}
          handleUnarchiveTask={handleUnarchiveTask}
          handleDeleteArchivedTask={handleDeleteArchivedTask}
          category={category}
          openArticleId={openArticleId}
          setOpenArticleId={setOpenArticleId}
          tasks={tasks}
          handleToRestart={handleToRestart}
          handleToggleRestartDone={handleToggleRestartDone}
          openTopicId={openTopicId}
          setOpenTopicId={setOpenTopicId}
          selectedTask={selectedTask}
          kbArticles={kbArticles}
          handleOpenArticle={handleOpenArticle}
          handleUpdateTask={handleUpdateTask}
          handleDeleteTask={handleDeleteTask}
          createFor={createFor}
          createPreset={createPreset}
          setCreatePreset={setCreatePreset}
          handleAddTask={handleAddTask}
          createSprint={createSprint}
          setCreateSprint={setCreateSprint}
          handleCreateSprint={handleCreateSprint}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  );
}