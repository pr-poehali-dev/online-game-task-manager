import { toast } from 'sonner';
import { authHeaders, TASKS_URL, outcomeMeta } from './shared';
import type { Task, TaskOutcome, ColumnId } from './shared';

export function useTaskActions(
  tasks: Task[],
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>,
  closeTaskModal: () => void,
  setCreateFor: (c: ColumnId | null) => void,
  setCreatePreset: (p: Partial<Task> | null) => void,
) {
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
    // Карточка задачи остаётся открытой после сохранения — просто возвращается в режим просмотра
    // (переключение делает сам TaskModal), закрывать окно здесь не нужно
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

  async function handleMoveTask(task: Task, column: ColumnId, deployStatus: Task['deployStatus']) {
    const prevTasks = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, column, deployStatus } : t)));
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update', id: task.id, title: task.title, column, deployStatus }),
      });
      if (!res.ok) {
        setTasks(prevTasks);
        toast.error('Не удалось изменить статус задачи');
      }
    } catch {
      setTasks(prevTasks);
      toast.error('Не удалось изменить статус задачи');
    }
  }

  async function handleDeleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    closeTaskModal();
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (!res.ok) {
        setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, task]));
        toast.error('Не удалось удалить задачу');
        return;
      }
    } catch {
      setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, task]));
      toast.error('Не удалось удалить задачу');
      return;
    }

    toast(`Задача удалена`, {
      description: task.title,
      duration: 5000,
      action: {
        label: 'Восстановить',
        onClick: () => handleAddTask({ ...task, id: undefined as unknown as string }),
      },
    });
  }

  async function handleArchiveTask(id: string, outcome: TaskOutcome) {
    const task = tasks.find((t) => t.id === id);
    closeTaskModal();
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
    if (!task) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (!res.ok) {
        setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, task]));
        toast.error('Не удалось удалить задачу');
        return;
      }
    } catch {
      setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, task]));
      toast.error('Не удалось удалить задачу');
      return;
    }
    toast(`Задача удалена окончательно`, { description: task.title });
  }

  return {
    handleAddTask,
    handleUpdateTask,
    handleMoveTask,
    handleDeleteTask,
    handleArchiveTask,
    handleUnarchiveTask,
    handleToRestart,
    handleToggleRestartDone,
    handleDeleteArchivedTask,
  };
}