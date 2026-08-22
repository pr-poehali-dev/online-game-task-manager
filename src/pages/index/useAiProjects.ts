import { useCallback, useEffect, useState } from 'react';
import { AI_URL, authHeaders } from './shared';

// Проект — личное рабочее пространство сотрудника в разделе AI: файлы + диалоги в одном месте
// (см. AI_PROJECTS_PLAN.md). Проекты приватные, чужие не видны.
export interface AiProject {
  id: number;
  name: string;
  description: string;
  instructions: string;
  summary: string;
  icon: string;
  color: string;
  archived: boolean;
  // summaryStale — состав файлов изменился с момента сборки автосводки, её пора обновить.
  summaryStale: boolean;
  summaryUpdatedAt: string | null;
  filesCount: number;
  filesSizeMb: number;
  chatsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiProjectFile {
  id: number;
  name: string;
  url: string;
  size: number;
  contentType: string;
  kind: string;
  createdAt: string | null;
  // Статус разбора файла для поиска: pending/indexing — в обработке, ready — готов,
  // unsupported — текста в файле нет (картинка/видео), failed — не удалось разобрать.
  indexStatus: string;
  chunksCount: number;
  // relPath — путь файла внутри загруженной папки (src/pages/Ai.tsx). Пусто — файл загружен
  // отдельно, вне папки.
  relPath: string;
}

export interface AiSearchHit {
  chunkId: number;
  fileId: number;
  fileName: string;
  fileUrl: string;
  chunkIndex: number;
  content: string;
}

export interface AiProjectChat {
  id: number;
  title: string;
  mode: string;
  model: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiProjectsState {
  projects: AiProject[];
  loading: boolean;
  usedProjects: number;
  limitProjects: number;
  activeProject: AiProject | null;
  activeProjectId: number | null;
  openProject: (id: number | null) => void;
  projectFiles: AiProjectFile[];
  projectChats: AiProjectChat[];
  detailLoading: boolean;
  error: string;
  load: () => Promise<void>;
  loadProject: (id: number) => Promise<void>;
  createProject: (name: string) => Promise<AiProject | null>;
  updateProject: (id: number, patch: Partial<AiProject>) => Promise<void>;
  deleteProject: (id: number, withContent: boolean) => Promise<void>;
  attachFiles: (fileIds: number[], projectId: number | null) => Promise<void>;
  // Разбор файлов для поиска: сколько ещё в очереди и идёт ли обработка прямо сейчас.
  indexPending: number;
  indexing: boolean;
  searchProject: (query: string) => Promise<AiSearchHit[]>;
  // Автосводка по документам проекта (вкладка «Обзор»).
  summaryLoading: boolean;
  refreshSummary: (force?: boolean) => Promise<void>;
}

// useAiProjects — состояние проектов: список слева и подробности открытого проекта (файлы,
// диалоги). Загрузка подробностей идёт только для открытого проекта, чтобы не тянуть содержимое
// всех проектов сразу.
export function useAiProjects(): AiProjectsState {
  const [projects, setProjects] = useState<AiProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedProjects, setUsedProjects] = useState(0);
  const [limitProjects, setLimitProjects] = useState(0);

  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeProject, setActiveProject] = useState<AiProject | null>(null);
  const [projectFiles, setProjectFiles] = useState<AiProjectFile[]>([]);
  const [projectChats, setProjectChats] = useState<AiProjectChat[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [indexPending, setIndexPending] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=list_projects`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProjects(data.projects || []);
        setUsedProjects(data.usedProjects || 0);
        setLimitProjects(data.limitProjects || 0);
      }
    } catch {
      /* ignore — список останется прежним */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadProject = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=get_project&projectId=${id}`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActiveProject(data.project || null);
        setProjectFiles(data.files || []);
        setProjectChats(data.chats || []);
      } else {
        setActiveProject(null);
        setActiveProjectId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeProjectId != null) loadProject(activeProjectId);
    else { setActiveProject(null); setProjectFiles([]); setProjectChats([]); }
  }, [activeProjectId, loadProject]);

  const openProject = useCallback((id: number | null) => {
    setError('');
    setActiveProjectId(id);
  }, []);

  const createProject = useCallback(async (name: string): Promise<AiProject | null> => {
    setError('');
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create_project', name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === 'project_limit_exceeded'
          ? 'Достигнут лимит проектов — заархивируйте ненужные или попросите администратора увеличить лимит'
          : 'Не удалось создать проект');
        return null;
      }
      await load();
      setActiveProjectId(data.project.id);
      return data.project as AiProject;
    } catch {
      setError('Не удалось создать проект — проверьте соединение');
      return null;
    }
  }, [load]);

  const updateProject = useCallback(async (id: number, patch: Partial<AiProject>) => {
    // Оптимистично обновляем карточку: правки названия/описания должны отражаться сразу, даже
    // если ответ сервера немного задержится.
    setActiveProject((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update_project', projectId: id, ...patch }),
      });
      if (res.ok) load();
    } catch {
      /* ignore */
    }
  }, [load]);

  const deleteProject = useCallback(async (id: number, withContent: boolean) => {
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete_project', projectId: id, withContent }),
      });
      if (res.ok) {
        setActiveProjectId(null);
        await load();
      }
    } catch {
      /* ignore */
    }
  }, [load]);

  const attachFiles = useCallback(async (fileIds: number[], projectId: number | null) => {
    if (!fileIds.length) return;
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'attach_files', fileIds, projectId }),
      });
      if (res.ok) {
        if (activeProjectId != null) await loadProject(activeProjectId);
        await load();
      }
    } catch {
      /* ignore */
    }
  }, [activeProjectId, load, loadProject]);

  // Разбор файлов идёт ПОРЦИЯМИ: один вызов index_step обрабатывает ограниченный кусок текста
  // (иначе большой документ не уложится в таймаут функции). Поэтому крутим цикл, пока сервер не
  // ответит, что всё готово, обновляя список файлов, чтобы статусы менялись на глазах.
  const runIndexing = useCallback(async (projectId: number) => {
    setIndexing(true);
    try {
      // Потолок шагов — защита от бесконечного цикла, если файл почему-то не может завершиться.
      for (let step = 0; step < 200; step += 1) {
        const res = await fetch(AI_URL, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'index_step', projectId }),
        });
        if (!res.ok) break;
        const data = await res.json().catch(() => ({}));
        setIndexPending(data.pending ?? 0);
        if (data.done) break;
      }
      await loadProject(projectId);
    } catch {
      /* ignore — оставшиеся файлы обработаются при следующем открытии проекта */
    } finally {
      setIndexing(false);
      setIndexPending(0);
    }
  }, [loadProject]);

  // При открытии проекта проверяем, остались ли необработанные файлы, и если да — доразбираем их.
  useEffect(() => {
    if (activeProjectId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${AI_URL}?action=index_status&projectId=${activeProjectId}`, {
          method: 'GET', headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && (data.pending || 0) > 0) {
          setIndexPending(data.pending);
          runIndexing(activeProjectId);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId, projectFiles.length, runIndexing]);

  // Автосводка собирается ассистентом и стоит денег, поэтому запрашиваем её только когда состав
  // файлов изменился (сервер сам отдаст готовую, если пересобирать нечего).
  const refreshSummary = useCallback(async (force = false) => {
    if (activeProjectId == null) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'project_summary', projectId: activeProjectId, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActiveProject((prev) => (prev && prev.id === activeProjectId
          ? { ...prev, summary: data.summary || '', summaryStale: false }
          : prev));
      }
    } catch {
      /* ignore — проект работает и без сводки */
    } finally {
      setSummaryLoading(false);
    }
  }, [activeProjectId]);

  // Обновляем сводку, когда все файлы разобраны: пересобирать её раньше бессмысленно — текста
  // документов ещё нет, ассистенту не из чего делать выводы.
  useEffect(() => {
    if (activeProjectId == null || !activeProject?.summaryStale || indexing || summaryLoading) return;
    refreshSummary();
  }, [activeProjectId, activeProject?.summaryStale, indexing, summaryLoading, refreshSummary]);

  const searchProject = useCallback(async (query: string): Promise<AiSearchHit[]> => {
    if (activeProjectId == null || query.trim().length < 2) return [];
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'search_project', projectId: activeProjectId, query }),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? (data.results || []) : [];
    } catch {
      return [];
    }
  }, [activeProjectId]);

  return {
    projects, loading, usedProjects, limitProjects,
    indexPending, indexing, searchProject,
    summaryLoading, refreshSummary,
    activeProject, activeProjectId, openProject,
    projectFiles, projectChats, detailLoading, error,
    load, loadProject, createProject, updateProject, deleteProject, attachFiles,
  };
}
