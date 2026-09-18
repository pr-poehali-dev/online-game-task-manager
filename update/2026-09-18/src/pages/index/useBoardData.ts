import { useState, useEffect, useCallback } from 'react';
import { KNOWLEDGE_URL, kbAuthHeaders } from '@/components/KnowledgeBase';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import { authHeaders, AUTH_URL, TASKS_URL, SPRINTS_URL, PATCHES_URL, IDEAS_URL, TOKEN_KEY } from './shared';
import type { TeamMember, Task, Sprint } from './shared';

export function useBoardData() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [kbArticles, setKbArticles] = useState<KbArticleBrief[]>([]);
  const [tasksWithPatchFiles, setTasksWithPatchFiles] = useState<Set<string>>(new Set());
  // Счётчик непрочитанных идей (см. idea_reads в backend/ideas) — живёт здесь, а не внутри
  // Ideas.tsx, потому что бейдж в шапке (IndexTopbar) должен быть виден даже когда раздел
  // «Идеи» ни разу не открывался за сессию (IndexMain монтирует его лениво, см. visited).
  const [ideasUnreadCount, setIdeasUnreadCount] = useState(0);

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

  // Список id задач (по всем серверам), к которым прикреплён хотя бы один файл патча —
  // нужен, чтобы подсветить на доске задачи, ожидающие заливки в лаунчер
  const loadTasksWithPatchFiles = useCallback(async () => {
    try {
      const res = await fetch(PATCHES_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'tasks_with_files' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasksWithPatchFiles(new Set<string>(data.taskIds || []));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Только счётчик — сам список идей грузит Ideas.tsx при открытии раздела. Дублирование
  // запроса `list` небольшое (раз в 30с при неоткрытом разделе), backend уже отдаёт unread
  // вместе со списком, второй эндпоинт заводить не пришлось.
  const loadIdeasUnreadCount = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setIdeasUnreadCount(0); return; }
    try {
      const res = await fetch(IDEAS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setIdeasUnreadCount(data.unread || 0);
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
    loadTasksWithPatchFiles();
    loadIdeasUnreadCount();
    const t = setInterval(loadTeam, 30000);
    const tIdeas = setInterval(loadIdeasUnreadCount, 30000);
    return () => { clearInterval(t); clearInterval(tIdeas); };
  }, [loadTeam, loadTasks, loadKbArticles, loadSprints, loadTasksWithPatchFiles, loadIdeasUnreadCount]);

  return {
    tasks,
    setTasks,
    sprints,
    setSprints,
    team,
    tasksLoading,
    kbArticles,
    tasksWithPatchFiles,
    reloadTasksWithPatchFiles: loadTasksWithPatchFiles,
    ideasUnreadCount,
    reloadIdeasUnreadCount: loadIdeasUnreadCount,
  };
}