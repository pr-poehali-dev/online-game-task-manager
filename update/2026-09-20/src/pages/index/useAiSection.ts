import { useState, useEffect, useCallback, useRef } from 'react';
import { AI_URL, AI_STREAM_URL, authHeaders } from './shared';
import type { ImageGenerateParams, VideoGenerateParams } from './AiGenerateComposer';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { useAiFiles } from './useAiFiles';
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

  // webSearch — состояние чекбокса "Использовать веб-поиск" над полем ввода (AiComposer.tsx).
  // По умолчанию true (раньше инструмент подключался автоматически ко всем сообщениям без выбора
  // сотрудника — сохраняем прежнее поведение "из коробки"). Для существующего диалога значение
  // подтягивается из БД в loadChat ниже (per-chat, как и модель), для нового — сбрасывается на
  // дефолт в handleNewChat.
  const [webSearch, setWebSearch] = useState(true);

  const [input, setInput] = useState('');
  // Формат документа в режиме 'document': 'auto' (решает модель) | 'xlsx' | 'docx'.
  const [documentFormat, setDocumentFormat] = useState('auto');
  // documentTemplate — загруженный бланк сотрудника. Пока он выбран, ассистент заполняет ИМЕННО
  // этот файл (сохраняя оформление), а не собирает документ с нуля.
  const [documentTemplate, setDocumentTemplate] = useState<AiAttachment | null>(null);
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
  // "Мои файлы" — личное хранилище сотрудника в разделе AI. Список грузится только при открытии
  // панели, но после КАЖДОЙ загрузки файла обновляем расход лимита, чтобы счётчик на кнопке был
  // актуальным даже с закрытой панелью.
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const files = useAiFiles(filesPanelOpen);

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

  // 'auto' сохранён в localStorage с тех пор, когда его ещё предлагали для картинок/видео
  // (AI Tunnel понимает его только в текстовом чате, см. aiHelpers.ts, auto_not_supported) — либо
  // это первый визит без сохранённого значения. Как только каталог группы images/videos
  // загрузился, тихо подставляем первую реальную модель вместо 'auto', чтобы отправка не падала
  // ошибкой на ровном месте.
  useEffect(() => {
    if (modelGroup === 'chat' || model !== 'auto') return;
    const firstModel = Object.keys(models)[0];
    if (firstModel) setModel(firstModel);
  }, [modelGroup, model, models]);

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
        if (data.chat?.webSearchEnabled != null) setWebSearch(data.chat.webSearchEnabled);
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
    setWebSearch(true);
  }

  // Бланк грузится тем же способом, что обычные вложения, но кладётся в отдельное состояние:
  // в сообщение он не прикрепляется, а передаётся серверу как templateUrl.
  async function handleUploadTemplate(file: File) {
    setUploading(true);
    setUploadProgress(null);
    setSendError('');
    try {
      const attachment = await uploadAiAttachment(file, (fraction) => setUploadProgress(fraction), 'template');
      setDocumentTemplate(attachment);
      files.load();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message;
      setSendError(code ? errorText(code, message) : 'Не удалось загрузить бланк — проверьте соединение');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleAddFile(file: File) {
    setUploading(true);
    setUploadProgress(null);
    try {
      const attachment = await uploadAiAttachment(file, (fraction) => setUploadProgress(fraction));
      setPendingAttachments((prev) => [...prev, attachment]);
      files.load();
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

  // streamingUnavailableRef — как только /api/ai/stream ответил 404 (облако poehali.dev, либо
  // self-hosted-сервер ещё не установил апдейт с этим маршрутом) — запоминаем на всю сессию
  // вкладки и больше не пробуем стрим, сразу шлём обычный запрос. Без этого при каждой отправке
  // сообщения было бы два похода в сеть вместо одного (пробуем стрим → 404 → обычный запрос).
  const streamingUnavailableRef = useRef(false);

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

    // Режим 'document' и вложения к сообщению — только обычным запросом. Документы идут отдельным
    // действием (generate_document), а стрим-эндпоинт (backend/ai/stream.py) поддерживает только
    // текстовые chat/code-сообщения без вложений — усложнять SSE-протокол разбором вложений того
    // не стоит, вложения в чате — редкий случай по сравнению с обычным текстовым вопросом.
    const canTryStream = mode !== 'document' && attachmentsToSend.length === 0 && !streamingUnavailableRef.current && !!AI_STREAM_URL;

    if (canTryStream) {
      const streamed = await sendMessageStream(content, tempId);
      if (streamed !== 'unavailable') {
        setSending(false);
        return;
      }
      // 'unavailable' — эндпоинта нет (404/сеть недоступна ДО первого байта ответа), откатываемся
      // на обычный запрос ниже; streamingUnavailableRef уже выставлен внутри sendMessageStream.
    }

    try {
      const res = await fetchWithTimeout(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        // Режим 'document' идёт отдельным действием: модель отдаёт структуру документа, а
        // .xlsx/.docx собирается на сервере и возвращается вложением (backend/ai/documents.py).
        body: JSON.stringify(mode === 'document'
          ? {
              action: 'generate_document', chatId: activeChatId, model, prompt: content,
              format: documentFormat,
              ...(documentTemplate ? { templateUrl: documentTemplate.url, templateName: documentTemplate.name } : {}),
            }
          : { action: 'send_message', chatId: activeChatId, model, content, mode, attachments: attachmentsToSend, webSearch }),
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

  // sendMessageStream — потоковая (SSE) отправка через /api/ai/stream (self-hosted-only, см.
  // backend/ai/stream.py и deploy/server.py). Возвращает 'unavailable', если эндпоинта нет
  // (маршрут не 200 ДО первого байта ответа) — вызывающий sendMessage тогда откатывается на
  // обычный запрос. Иначе сама доводит сообщение до конца (успех или ошибка) и возвращает 'done'.
  async function sendMessageStream(content: string, tempId: number): Promise<'done' | 'unavailable'> {
    let res: Response;
    try {
      res = await fetchWithTimeout(AI_STREAM_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ chatId: activeChatId, model, content, mode, webSearch }),
      }, SEND_TIMEOUT_MS);
    } catch {
      // Сетевая ошибка ДО ответа — не различить "эндпоинта нет" от "сеть недоступна", но
      // безопаснее один раз попробовать обычный запрос, чем оставить сотрудника без ответа.
      return 'unavailable';
    }
    if (!res.ok || !res.body) {
      streamingUnavailableRef.current = true;
      return 'unavailable';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    // assistantReasoning — накапливается ОТДЕЛЬНО от текста ответа: "думающие" модели присылают
    // reasoningDelta РАНЬШЕ обычных delta (см. backend/ai/stream.py) — сначала ход рассуждений
    // целиком, потом сам ответ. AiMessageList.tsx показывает его сворачиваемым блоком над текстом.
    let assistantReasoning = '';
    let assistantTempId = tempId - 1;
    let gotFirstEvent = false;

    const appendAssistantChunk = (deltaText: string) => {
      assistantText += deltaText;
      setMessages((prev) => {
        const has = prev.some((m) => m.id === assistantTempId);
        if (has) {
          return prev.map((m) => (m.id === assistantTempId ? { ...m, content: assistantText } : m));
        }
        return [...prev, {
          id: assistantTempId, role: 'assistant', content: assistantText, attachments: null,
          model, costRub: null, jobStatus: 'done', createdAt: null, pinned: false,
          reasoning: assistantReasoning || null,
        }];
      });
    };

    const appendReasoningChunk = (deltaText: string) => {
      assistantReasoning += deltaText;
      setMessages((prev) => {
        const has = prev.some((m) => m.id === assistantTempId);
        if (has) {
          return prev.map((m) => (m.id === assistantTempId ? { ...m, reasoning: assistantReasoning } : m));
        }
        return [...prev, {
          id: assistantTempId, role: 'assistant', content: '', attachments: null,
          model, costRub: null, jobStatus: 'done', createdAt: null, pinned: false,
          reasoning: assistantReasoning,
        }];
      });
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const eventEnd = buffer.indexOf('\n\n');
          if (eventEnd === -1) break;
          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);
          const line = rawEvent.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          gotFirstEvent = true;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (evt.error) {
            setSendError(errorText(evt.error as string, evt.message as string | undefined));
            setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== assistantTempId));
            if (evt.error !== 'limit_exceeded') setRetryAction(() => () => sendMessage(content, []));
            if (evt.spentRub != null) setUsage({ spentRub: evt.spentRub as number, limitRub: evt.limitRub as number });
            return 'done';
          }
          if (evt.reasoningDelta) {
            appendReasoningChunk(evt.reasoningDelta as string);
            continue;
          }
          if (evt.delta) {
            appendAssistantChunk(evt.delta as string);
            continue;
          }
          if (evt.done) {
            const chatId = evt.chatId as number;
            setMessages((prev) => prev.map((m) => {
              if (m.id === tempId) return { ...m, id: (evt.userMessageId as number) ?? m.id, createdAt: (evt.userCreatedAt as string) ?? null };
              if (m.id === assistantTempId) {
                return {
                  ...m, id: evt.assistantMessageId as number, model: evt.model as string,
                  costRub: evt.costRub as number, createdAt: evt.assistantCreatedAt as string,
                };
              }
              return m;
            }));
            if (evt.usage) setUsage(evt.usage as AiUsage);
            if (!activeChatId) {
              setActiveChatId(chatId);
              loadChats();
              generateTitle(chatId);
            } else {
              setChats((prev) => {
                const idx = prev.findIndex((c) => c.id === activeChatId);
                if (idx === -1) return prev;
                const updated = [...prev];
                const [chat] = updated.splice(idx, 1);
                return [{ ...chat, updatedAt: new Date().toISOString() }, ...updated];
              });
            }
            return 'done';
          }
          // Первое событие потока — подтверждение старта (chatId/userMessageId), у него нет
          // отдельного поля-маркера, просто игнорируем как "не error/delta/done".
          if (evt.userMessageId) {
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: evt.userMessageId as number, createdAt: evt.userCreatedAt as string } : m)));
            assistantTempId = (evt.userMessageId as number) * -1 - 1;
          }
        }
      }
    } catch {
      if (!gotFirstEvent) {
        streamingUnavailableRef.current = true;
        return 'unavailable';
      }
      setSendError('Соединение прервалось во время ответа — попробуйте ещё раз');
      setRetryAction(() => () => sendMessage(content, []));
      return 'done';
    }
    return 'done';
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
    const videoAttachments = [...params.frameImages, ...params.inputReferences];
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: params.prompt, attachments: videoAttachments.length ? videoAttachments : null, model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false }]);

    try {
      const body: Record<string, unknown> = { action: 'generate_video', chatId: activeChatId, model, prompt: params.prompt, duration: params.duration };
      if (params.aspectRatio) body.aspectRatio = params.aspectRatio;
      if (params.resolution) body.resolution = params.resolution;
      // Звук отправляем только когда его явно выключили: у моделей без поддержки переключателя
      // любое присутствие параметра приводит к ошибке 400.
      if (!params.generateAudio) body.generateAudio = false;
      if (params.frameImages.length) body.frameImages = params.frameImages;
      if (params.inputReferences.length) body.inputReferences = params.inputReferences;

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
        { ...data.userMessage, attachments: data.userMessage.attachments || null, jobStatus: 'done', pinned: false },
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
    webSearch, setWebSearch,
    input, setInput, sending, sendError, retryAction, usage, forbidden,
    documentFormat, setDocumentFormat,
    documentTemplate, setDocumentTemplate, handleUploadTemplate,
    pendingAttachments, uploading, uploadProgress,
    chatListOpen, setChatListOpen,
    modelFaqOpen, setModelFaqOpen,
    templatesManagerOpen, setTemplatesManagerOpen,
    promptTemplates,
    files, filesPanelOpen, setFilesPanelOpen,
    handleModeChange, handleNewChat, handleAddFile, handleRemoveAttachment,
    handleSend, handleGenerateImage, handleGenerateVideo, handleRegenerate,
    handleSearchMessages, handleRenameChat, handleTogglePinned, handleDeleteChat,
    handleTogglePinnedMessage,
    limitExceeded, activeChatTitle,
  };
}