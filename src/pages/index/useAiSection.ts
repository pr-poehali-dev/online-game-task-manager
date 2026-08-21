import { useState, useEffect, useCallback, useRef } from 'react';
import { AI_URL, authHeaders } from './shared';
import type { ImageGenerateParams, VideoGenerateParams } from './AiGenerateComposer';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { uploadAiAttachment } from './aiUploadApi';
import { AI_ACTIVE_CHAT_KEY, MODE_TABS } from './AiTypes';
import type { AiChatSummary, AiMessage, AiModelsMap, AiUsage, AiAttachment, AiMode, AiMessageSearchResult } from './AiTypes';
import { AI_MODEL_KEY_PREFIX, VIDEO_POLL_INTERVAL, SEND_TIMEOUT_MS, errorText, fetchWithTimeout } from './aiHelpers';

// useAiSection — ВСЯ состояние-логика раздела "AI" (список диалогов, сообщения, каталог моделей,
// отправка/генерация, лимиты, вложения, поллинг видео). Вынесена из Ai.tsx без изменений, чтобы
// корневой компонент остался только сборкой разметки из под-компонентов.
export function useAiSection() {
  const [mode, setMode] = useState<AiMode>('chat');
  const [chats, setChats] = useState<AiChatSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<number | null>(() => {
    const saved = localStorage.getItem(AI_ACTIVE_CHAT_KEY);
    return saved ? Number(saved) : null;
  });

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [models, setModels] = useState<AiModelsMap>({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const modelGroup = MODE_TABS.find((t) => t.id === mode)!.modelGroup;
  const [model, setModel] = useState(() => localStorage.getItem(AI_MODEL_KEY_PREFIX + 'chat') || 'auto');

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // retryAction — что именно повторить по кнопке "Повторить" рядом с текстом ошибки. Храним
  // готовое замыкание с параметрами упавшего запроса (текст+вложения для чата, полный набор
  // настроек для генерации), чтобы сотруднику не приходилось заново набирать промпт и
  // перевыбирать файлы после сетевого сбоя или таймаута модели.
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<AiAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  // uploadProgress — доля загруженного файла (0..1), обновляется только при кусочной загрузке
  // больших файлов (см. aiUploadApi.ts); для маленьких файлов остаётся null — грузятся мгновенно.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Список чатов на мобильных экранах (< lg) скрыт за кнопкой-гамбургером и открывается поверх
  // переписки в Sheet — тот же паттерн, что мобильное меню разделов в IndexTopbar.tsx/Cabinet.tsx.
  const [chatListOpen, setChatListOpen] = useState(false);
  const [modelFaqOpen, setModelFaqOpen] = useState(false);
  const [templatesManagerOpen, setTemplatesManagerOpen] = useState(false);
  const promptTemplates = useAiPromptTemplates();

  useEffect(() => { localStorage.setItem(AI_MODEL_KEY_PREFIX + modelGroup, model); }, [model, modelGroup]);
  useEffect(() => {
    if (activeChatId != null) localStorage.setItem(AI_ACTIVE_CHAT_KEY, String(activeChatId));
    else localStorage.removeItem(AI_ACTIVE_CHAT_KEY);
  }, [activeChatId]);

  // При смене вкладки режима подставляем последнюю выбранную модель именно ЭТОЙ группы (список
  // моделей чата/изображений/видео — разные каталоги, нет смысла запоминать одну модель на всех).
  function handleModeChange(next: AiMode) {
    setMode(next);
    setModelsLoading(true);
    const nextGroup = MODE_TABS.find((t) => t.id === next)!.modelGroup;
    setModel(localStorage.getItem(AI_MODEL_KEY_PREFIX + nextGroup) || 'auto');
  }

  const loadModels = useCallback(async (group: string) => {
    setModelsLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=list_models&group=${group}`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setModels(data.models || {});
    } catch {
      /* ignore — пикер моделей просто останется пустым, ошибка не критична для показа чата */
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=list_chats`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setChats(data.chats || []);
    } catch {
      /* ignore */
    } finally {
      setChatsLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch(`${AI_URL}?action=usage`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { loadModels(modelGroup); }, [modelGroup, loadModels]);
  useEffect(() => { loadChats(); loadUsage(); }, [loadChats, loadUsage]);

  const loadChat = useCallback(async (chatId: number) => {
    setMessagesLoading(true);
    setSendError('');
    try {
      const res = await fetch(`${AI_URL}?action=get_chat&chatId=${chatId}`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages(data.messages || []);
        if (data.chat?.mode) setMode(data.chat.mode);
        if (data.chat?.model) setModel(data.chat.model);
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch {
      /* ignore */
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeChatId != null) loadChat(activeChatId);
    else setMessages([]);
  }, [activeChatId, loadChat]);

  // Поллинг статуса генерации видео — пока в текущем открытом чате есть сообщение со
  // job_status='pending', опрашиваем его раз в VIDEO_POLL_INTERVAL до готовности/ошибки.
  const pollingRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const pendingIds = messages.filter((m) => m.jobStatus === 'pending').map((m) => m.id);
    if (pendingIds.length === 0) return;
    const timer = setInterval(async () => {
      for (const msgId of pendingIds) {
        if (pollingRef.current.has(msgId)) continue;
        pollingRef.current.add(msgId);
        try {
          const res = await fetch(`${AI_URL}?action=check_video_job&messageId=${msgId}`, { method: 'GET', headers: authHeaders() });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.jobStatus !== 'pending') {
            setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, jobStatus: data.jobStatus, attachments: data.attachments || m.attachments } : m)));
            if (data.costRub) loadUsage();
          }
        } catch {
          /* ignore, попробуем на следующем тике */
        } finally {
          pollingRef.current.delete(msgId);
        }
      }
    }, VIDEO_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [messages, loadUsage]);

  function handleNewChat() {
    setActiveChatId(null);
    setMessages([]);
    setSendError('');
    setPendingAttachments([]);
  }

  async function handleAddFile(file: File) {
    setUploading(true);
    setUploadProgress(null);
    try {
      const attachment = await uploadAiAttachment(file, (fraction) => setUploadProgress(fraction));
      setPendingAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message;
      setSendError(code ? errorText(code, message) : 'Не удалось загрузить файл — проверьте соединение');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  function handleRemoveAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Осмысленное название нового диалога вместо обрезанного первого сообщения. Запускается ФОНОМ
  // после того, как ответ уже показан сотруднику — намеренно не ждём его и молча игнорируем
  // ошибку: название это косметика, из-за неё не должно ломаться ничего в основном сценарии.
  async function generateTitle(chatId: number) {
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'generate_title', chatId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.title) {
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: data.title } : c)));
      }
    } catch {
      /* ignore — останется название по первому сообщению */
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    setPendingAttachments([]);
    sendMessage(content, pendingAttachments);
  }

  // sendMessage вынесен отдельно от handleSend, чтобы тот же самый запрос (с теми же вложениями)
  // можно было переотправить по кнопке "Повторить", не полагаясь на текущее содержимое композера
  // — сотрудник мог уже начать печатать следующий вопрос.
  async function sendMessage(content: string, attachmentsToSend: AiAttachment[]) {
    if (sending) return;
    setSending(true);
    setSendError('');
    setRetryAction(null);

    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content, attachments: attachmentsToSend.length ? attachmentsToSend : null, model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false }]);

    try {
      const res = await fetchWithTimeout(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'send_message', chatId: activeChatId, model, content, mode, attachments: attachmentsToSend }),
      }, SEND_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        // Лимит исчерпан — повторять бессмысленно, пока администратор не поднимет лимит.
        if (data.error !== 'limit_exceeded') setRetryAction(() => () => sendMessage(content, attachmentsToSend));
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, jobStatus: 'done', pinned: false },
        { ...data.assistantMessage, attachments: data.assistantMessage.attachments || null, jobStatus: 'done', pinned: false },
      ]);
      if (data.usage) setUsage(data.usage);
      if (!activeChatId) {
        setActiveChatId(data.chatId);
        loadChats();
        generateTitle(data.chatId);
      } else {
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === activeChatId);
          if (idx === -1) return prev;
          const updated = [...prev];
          const [chat] = updated.splice(idx, 1);
          return [{ ...chat, updatedAt: new Date().toISOString() }, ...updated];
        });
      }
    } catch (err) {
      setSendError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Модель слишком долго не отвечает — попробуйте другую модель или повторите запрос'
          : 'Не удалось отправить сообщение — проверьте соединение'
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setRetryAction(() => () => sendMessage(content, attachmentsToSend));
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateImage(params: ImageGenerateParams) {
    setSending(true);
    setSendError('');
    setRetryAction(null);
    const tempId = -Date.now();
    setMessages((prev) => [...prev, {
      id: tempId, role: 'user', content: params.prompt,
      attachments: params.inputReferences.length ? params.inputReferences : null,
      model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false,
    }]);

    try {
      const body: Record<string, unknown> = {
        action: 'generate_image', chatId: activeChatId, model, prompt: params.prompt, n: params.n,
      };
      // aspectRatio НЕ передаём при редактировании по референсу (inputReferences) — иначе модель
      // насильно растягивает результат под выбранное в UI соотношение сторон вместо того, чтобы
      // сохранить пропорции исходного фото (это и вызывало "плывущие" пропорции у отредактированных
      // картинок — параметр отправлялся даже когда сотрудник просто просил поменять цвет волос).
      if (!params.inputReferences.length) body.aspectRatio = params.aspectRatio;
      if (params.quality) body.quality = params.quality;
      if (params.outputFormat) body.outputFormat = params.outputFormat;
      if (params.transparentBackground) body.background = 'transparent';
      if (params.inputReferences.length) body.inputReferences = params.inputReferences;

      const res = await fetchWithTimeout(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }, SEND_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (data.error !== 'limit_exceeded') setRetryAction(() => () => handleGenerateImage(params));
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, attachments: data.userMessage.attachments || null, jobStatus: 'done', pinned: false },
        { ...data.assistantMessage, attachments: data.assistantMessage.attachments || null, jobStatus: 'done', pinned: false },
      ]);
      if (data.usage) setUsage(data.usage);
      if (!activeChatId) { setActiveChatId(data.chatId); loadChats(); }
    } catch (err) {
      setSendError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Модель слишком долго не отвечает — попробуйте другую модель или повторите запрос'
          : 'Не удалось запустить генерацию — проверьте соединение'
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setRetryAction(() => () => handleGenerateImage(params));
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateVideo(params: VideoGenerateParams) {
    setSending(true);
    setSendError('');
    setRetryAction(null);
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: params.prompt, attachments: null, model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false }]);

    try {
      const body: Record<string, unknown> = { action: 'generate_video', chatId: activeChatId, model, prompt: params.prompt, duration: params.duration };

      const res = await fetchWithTimeout(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }, SEND_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        // Повтор предлагаем только если задача ТОЧНО не стартовала (ошибка пришла от нашего
        // backend или AI Tunnel отклонил запрос) — за уже запущенную генерацию видео провайдер
        // списывает деньги сразу и не возвращает их, повторный запуск был бы двойной оплатой.
        if (data.error !== 'limit_exceeded') setRetryAction(() => () => handleGenerateVideo(params));
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, jobStatus: 'done', pinned: false },
        { ...data.assistantMessage, attachments: data.assistantMessage.attachments || null, jobStatus: data.assistantMessage.jobStatus || 'done', pinned: false },
      ]);
      if (data.usage) setUsage(data.usage);
      if (!activeChatId) { setActiveChatId(data.chatId); loadChats(); }
    } catch (err) {
      // Сетевой обрыв/таймаут при запуске видео — повтор НЕ предлагаем: задача могла успешно
      // стартовать на стороне AI Tunnel, просто ответ до нас не дошёл, и повторный запуск
      // означал бы вторую оплату той же генерации.
      setSendError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Генерация могла запуститься — обновите страницу и проверьте диалог, прежде чем запускать заново'
          : 'Не удалось запустить генерацию — проверьте соединение и обновите страницу перед повтором'
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  // Перегенерация последнего ответа ассистента — старый ответ заменяется новым по той же
  // истории. Модель берётся ТЕКУЩАЯ из шапки, поэтому переключив её перед нажатием, можно
  // сравнить, как на тот же вопрос ответит другая модель (см. backend action=regenerate).
  async function handleRegenerate() {
    if (!activeChatId || sending) return;
    setSending(true);
    setSendError('');
    setRetryAction(null);
    try {
      const res = await fetchWithTimeout(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'regenerate', chatId: activeChatId, model }),
      }, SEND_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        if (data.error !== 'limit_exceeded') setRetryAction(() => handleRegenerate);
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== data.replacedMessageId),
        { ...data.assistantMessage, attachments: null, jobStatus: 'done', pinned: false },
      ]);
      if (data.usage) setUsage(data.usage);
    } catch (err) {
      setSendError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Модель слишком долго не отвечает — попробуйте другую модель или повторите запрос'
          : 'Не удалось перегенерировать ответ — проверьте соединение'
      );
      setRetryAction(() => handleRegenerate);
    } finally {
      setSending(false);
    }
  }

  // Поиск по содержимому всех диалогов (backend action=search_messages). useCallback обязателен:
  // AiChatList запускает поиск в useEffect по изменению этой функции — без мемоизации он бы
  // перезапускался на каждый рендер.
  const handleSearchMessages = useCallback(async (query: string): Promise<AiMessageSearchResult[]> => {
    const res = await fetch(`${AI_URL}?action=search_messages&query=${encodeURIComponent(query)}`, { method: 'GET', headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    return res.ok ? (data.results || []) : [];
  }, []);

  async function handleRenameChat(chatId: number, title: string) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)));
    await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'rename_chat', chatId, title }) });
  }

  async function handleTogglePinned(chatId: number, pinned: boolean) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pinned } : c)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
    await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'set_pinned', chatId, pinned }) });
    loadChats();
  }

  async function handleDeleteChat(chatId: number) {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) { setActiveChatId(null); setMessages([]); }
    await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'delete_chat', chatId }) });
  }

  // Закрепление ОДНОГО сообщения ассистента внутри текущего диалога — для быстрого поиска
  // полезного ответа в длинной переписке (см. backend/ai/index.py, action=set_message_pinned).
  async function handleTogglePinnedMessage(messageId: number, pinned: boolean) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pinned } : m)));
    await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'set_message_pinned', messageId, pinned }) });
  }

  const limitExceeded = !!usage && usage.spentRub >= usage.limitRub;
  const activeChatTitle = chats.find((c) => c.id === activeChatId)?.title;

  return {
    mode, chats, chatsLoading, activeChatId, setActiveChatId,
    messages, messagesLoading,
    models, modelsLoading, model, setModel,
    input, setInput, sending, sendError, retryAction, usage, forbidden,
    pendingAttachments, uploading, uploadProgress,
    chatListOpen, setChatListOpen,
    modelFaqOpen, setModelFaqOpen,
    templatesManagerOpen, setTemplatesManagerOpen,
    promptTemplates,
    handleModeChange, handleNewChat, handleAddFile, handleRemoveAttachment,
    handleSend, handleGenerateImage, handleGenerateVideo, handleRegenerate,
    handleSearchMessages, handleRenameChat, handleTogglePinned, handleDeleteChat,
    handleTogglePinnedMessage,
    limitExceeded, activeChatTitle,
  };
}
