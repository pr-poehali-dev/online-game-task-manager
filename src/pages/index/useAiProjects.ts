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

  return {
    projects, loading, usedProjects, limitProjects,
    activeProject, activeProjectId, openProject,
    projectFiles, projectChats, detailLoading, error,
    load, loadProject, createProject, updateProject, deleteProject, attachFiles,
  };
}
