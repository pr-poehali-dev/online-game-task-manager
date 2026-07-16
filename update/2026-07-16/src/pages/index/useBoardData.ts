import { useState, useEffect, useCallback } from 'react';
import { KNOWLEDGE_URL, kbAuthHeaders } from '@/components/KnowledgeBase';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import { authHeaders, AUTH_URL, TASKS_URL, SPRINTS_URL, TOKEN_KEY } from './shared';
import type { TeamMember, Task, Sprint } from './shared';

export function useBoardData() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [kbArticles, setKbArticles] = useState<KbArticleBrief[]>([]);

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

  return {
    tasks,
    setTasks,
    sprints,
    setSprints,
    team,
    tasksLoading,
    kbArticles,
  };
}
