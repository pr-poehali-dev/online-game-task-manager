import { toast } from 'sonner';
import { authHeaders, SPRINTS_URL } from './shared';
import type { Sprint, Task } from './shared';

export function useSprintActions(
  sprints: Sprint[],
  setSprints: React.Dispatch<React.SetStateAction<Sprint[]>>,
  setCreateSprint: (v: boolean) => void,
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>,
) {
  async function handleCreateSprint(sprint: Sprint, taskIds: string[] = []) {
    try {
      const res = await fetch(SPRINTS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', ...sprint, taskIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprints((prev) => [...prev, data.sprint]);
        if (taskIds.length > 0 && setTasks) {
          setTasks((prev) => prev.map((t) => (taskIds.includes(t.id) ? { ...t, sprintId: data.sprint.id } : t)));
        }
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

  function handleRestoreSprint(id: string) {
    const sp = sprints.find((s) => s.id === id);
    if (!sp) return;
    handleUpdateSprint({ ...sp, status: 'planned' });
  }

  return {
    handleCreateSprint,
    handleUpdateSprint,
    handleDeleteSprint,
    handleRestoreSprint,
  };
}