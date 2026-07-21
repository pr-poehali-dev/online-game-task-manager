import { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
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
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();

  // Постоянная ссылка на статью базы знаний
  function handleOpenArticle(id: string) {
    navigate(`/kb/${id}`);
  }

  // Постоянная ссылка на задачу — сохраняется в адресной строке, можно скопировать или обновить страницу
  function handleOpenTaskById(taskId: string) {
    navigate(`/task/${taskId}`);
  }

  // Постоянная ссылка на идею
  function handleOpenIdeaById(ideaId: string) {
    navigate(`/idea/${ideaId}`);
  }

  // Закрытие карточки/страницы, открытой по постоянной ссылке (/task/:id, /idea/:id, /kb/:id):
  // возвращаемся назад в истории браузера (тогда кнопка «назад» тоже закрывает элемент),
  // либо на доску, если истории нет.
  // Проверяем именно позицию в истории (history.state.idx), а не location.key: при заходе по
  // прямой ссылке без авторизации происходит редирект через /login (ProtectedRoute) и обратно
  // (Login.tsx) — оба раза с replace, из-за чего location.key перестаёт быть 'default', хотя
  // реальной записи с доской в истории по-прежнему нет. Позиция (idx) при replace не меняется,
  // поэтому остаётся 0 и корректно определяет отсутствие истории для возврата.
  function closeOverlay() {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (idx === undefined || idx <= 0) navigate('/', { replace: true });
    else navigate(-1);
  }

  // Открытие задачи по постоянному адресу /task/:id (и закрытие при уходе с этого адреса,
  // в т.ч. кнопкой «назад» в браузере)
  useEffect(() => {
    if (!location.pathname.startsWith('/task/')) {
      setSelectedTask(null);
      return;
    }
    const taskId = params.id;
    if (!taskId || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setView(task.archived ? 'archive' : task.column === 'restart' ? 'restart' : 'board');
      setSelectedTask(task);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, params.id, tasks]);

  // Открытие идеи по постоянному адресу /idea/:id (и закрытие при уходе с этого адреса,
  // в т.ч. кнопкой «назад» в браузере)
  useEffect(() => {
    if (!location.pathname.startsWith('/idea/')) {
      setOpenTopicId(null);
      return;
    }
    const ideaId = params.id;
    if (!ideaId) return;
    setSelectedTask(null);
    setOpenTopicId(ideaId);
    setView('ideas');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, params.id]);

  // Открытие статьи базы знаний по постоянному адресу /kb/:id (и закрытие при уходе с адреса,
  // в т.ч. кнопкой «назад» в браузере)
  useEffect(() => {
    if (!location.pathname.startsWith('/kb/')) {
      setOpenArticleId(null);
      return;
    }
    const articleId = params.id;
    if (!articleId) return;
    setSelectedTask(null);
    setOpenArticleId(articleId);
    setView('knowledge');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, params.id]);

  // Обратная совместимость со старыми ссылками вида /?task=123 / /?idea=123 / /?article=123
  // (например уже отправленные в Telegram до перехода на постоянные адреса) — переводим на новый формат
  useEffect(() => {
    const legacyTaskId = searchParams.get('task');
    const legacyIdeaId = searchParams.get('idea');
    const legacyArticleId = searchParams.get('article');
    if (legacyTaskId) { navigate(`/task/${legacyTaskId}`, { replace: true }); return; }
    if (legacyIdeaId) { navigate(`/idea/${legacyIdeaId}`, { replace: true }); return; }
    if (legacyArticleId) { navigate(`/kb/${legacyArticleId}`, { replace: true }); return; }
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
    closeOverlay,
  };
}