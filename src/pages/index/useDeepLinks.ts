import { useEffect } from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { AuthUser } from '@/lib/auth';
import type { Task, ViewId } from './shared';

type SearchParamsTuple = ReturnType<typeof useSearchParams>;

export function useDeepLinks({
  tasks,
  user,
  searchParams,
  setSearchParams,
  setSelectedTask,
  setOpenArticleId,
  setOpenTopicId,
  setView,
  setAssigneeFilter,
}: {
  tasks: Task[];
  user: AuthUser | null;
  searchParams: SearchParamsTuple[0];
  setSearchParams: SearchParamsTuple[1];
  setSelectedTask: (t: Task | null) => void;
  setOpenArticleId: (id: string | null) => void;
  setOpenTopicId: (id: string | null) => void;
  setView: (v: ViewId) => void;
  setAssigneeFilter: (a: number | 'all') => void;
}) {
  function handleOpenArticle(id: string) {
    setSelectedTask(null);
    setOpenArticleId(id);
    setView('knowledge');
  }

  function handleOpenTaskById(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setView(task.archived ? 'archive' : task.column === 'restart' ? 'restart' : 'board');
      setSelectedTask(task);
    }
  }

  function handleOpenIdeaById(ideaId: string) {
    setSelectedTask(null);
    setOpenTopicId(ideaId);
    setView('ideas');
  }

  // Открытие конкретной задачи по прямой ссылке (например из уведомления в Telegram: /?task=123)
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || tasks.length === 0) return;
    handleOpenTaskById(taskId);
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, searchParams]);

  // Открытие конкретной статьи базы знаний по прямой ссылке (например из хранилища файлов в админке: /?article=123)
  useEffect(() => {
    const articleId = searchParams.get('article');
    if (!articleId) return;
    handleOpenArticle(articleId);
    const next = new URLSearchParams(searchParams);
    next.delete('article');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Открытие конкретной идеи по прямой ссылке (например из хранилища файлов в админке: /?idea=123)
  useEffect(() => {
    const ideaId = searchParams.get('idea');
    if (!ideaId) return;
    handleOpenIdeaById(ideaId);
    const next = new URLSearchParams(searchParams);
    next.delete('idea');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Быстрый переход к своим задачам по прямой ссылке (например из кнопки бота: /?my=1)
  useEffect(() => {
    if (!user || searchParams.get('my') !== '1') return;
    setAssigneeFilter(user.id);
    setView('board');
    const next = new URLSearchParams(searchParams);
    next.delete('my');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  return {
    handleOpenArticle,
    handleOpenTaskById,
    handleOpenIdeaById,
  };
}
