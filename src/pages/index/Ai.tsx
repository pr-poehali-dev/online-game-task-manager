import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AI_URL, authHeaders } from './shared';
import AiChatList from './AiChatList';
import AiModelPicker from './AiModelPicker';
import AiMessageList from './AiMessageList';
import AiComposer from './AiComposer';
import AiGenerateComposer from './AiGenerateComposer';
import AiModelFaqModal from './AiModelFaqModal';
import AiTemplatesManager from './AiTemplatesManager';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { uploadAiAttachment } from './aiUploadApi';
import { AI_ACTIVE_CHAT_KEY, MODE_TABS } from './AiTypes';
import type { AiChatSummary, AiMessage, AiModelsMap, AiUsage, AiAttachment, AiMode } from './AiTypes';

const AI_MODEL_KEY_PREFIX = 'ai_last_model_';
const VIDEO_POLL_INTERVAL = 6000;

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'Раздел «AI» вам не доступен — обратитесь к владельцу проекта',
  unauthorized: 'Сессия истекла — обновите страницу и войдите заново',
  aitunnel_not_configured: 'Доступ к AI Tunnel не настроен — заполните ключ в разделе «Служебные ключи»',
  aitunnel_unreachable: 'Не удалось связаться с AI Tunnel — проверьте соединение и попробуйте ещё раз',
  aitunnel_error: 'Модель вернула ошибку — попробуйте другую модель или переформулируйте запрос',
  limit_exceeded: 'Месячный лимит на AI исчерпан — обратитесь к администратору, чтобы увеличить лимит',
  file_too_large: 'Файл слишком большой (максимум 200 МБ)',
  no_data: 'Не удалось прочитать файл',
  bad_request: 'Заполните запрос перед отправкой',
  not_found: 'Диалог не найден — возможно, он был удалён',
};

// Коды ошибок AI Tunnel совпадают с HTTP-статусами (см. docs/ai-tunnel-api-reference.md, раздел
// "Ошибки") — по статусу можно дать более точную подсказку, чем универсальное "модель вернула
// ошибку", не разбирая текст message на стороне фронта.
const AITUNNEL_STATUS_MESSAGES: Record<number, string> = {
  400: 'Модель не приняла запрос — попробуйте другую модель или измените промпт',
  401: 'Ключ AI Tunnel недействителен — сообщите администратору, нужно обновить его в «Служебных ключах»',
  402: 'На балансе AI Tunnel закончились деньги — сообщите администратору проекта',
  429: 'Модель сейчас перегружена запросами — подождите немного и попробуйте снова',
};

function errorText(err: string, message?: string, status?: number): string {
  if (err === 'aitunnel_error') {
    if (status && AITUNNEL_STATUS_MESSAGES[status]) return AITUNNEL_STATUS_MESSAGES[status];
    if (message) return message;
  }
  return ERROR_MESSAGES[err] || 'Не удалось выполнить запрос — попробуйте ещё раз';
}

export default function Ai() {
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

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');
    setInput('');
    const attachmentsToSend = pendingAttachments;
    setPendingAttachments([]);

    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content, attachments: attachmentsToSend.length ? attachmentsToSend : null, model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false }]);

    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'send_message', chatId: activeChatId, model, content, mode, attachments: attachmentsToSend }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        setPendingAttachments(attachmentsToSend);
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
      } else {
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === activeChatId);
          if (idx === -1) return prev;
          const updated = [...prev];
          const [chat] = updated.splice(idx, 1);
          return [{ ...chat, updatedAt: new Date().toISOString() }, ...updated];
        });
      }
    } catch {
      setSendError('Не удалось отправить сообщение — проверьте соединение');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setPendingAttachments(attachmentsToSend);
    } finally {
      setSending(false);
    }
  }

  async function handleGenerate(params: { prompt: string; aspectRatio?: string; duration?: number }) {
    setSending(true);
    setSendError('');
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: params.prompt, attachments: null, model: null, costRub: null, jobStatus: 'done', createdAt: null, pinned: false }]);

    try {
      const action = mode === 'image' ? 'generate_image' : 'generate_video';
      const body: Record<string, unknown> = { action, chatId: activeChatId, model, prompt: params.prompt };
      if (mode === 'image') body.aspectRatio = params.aspectRatio;
      if (mode === 'video') body.duration = params.duration;

      const res = await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message, res.status));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
    } catch {
      setSendError('Не удалось запустить генерацию — проверьте соединение');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

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

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto mt-10 text-center">
        <Icon name="Lock" size={28} className="text-muted-foreground mx-auto mb-3" />
        <h2 className="font-display text-lg mb-1">Раздел «AI» недоступен</h2>
        <p className="text-sm text-muted-foreground">
          Обратитесь к владельцу проекта, чтобы получить доступ к общению с ИИ-моделями.
        </p>
      </div>
    );
  }

  const limitExceeded = !!usage && usage.spentRub >= usage.limitRub;
  const activeChatTitle = chats.find((c) => c.id === activeChatId)?.title;

  return (
    <div className="flex rounded-xl border border-border overflow-hidden bg-card/20 h-[calc(100vh-8.5rem)]">
      <div className="hidden lg:flex">
        <AiChatList
          chats={chats}
          chatsLoading={chatsLoading}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onNewChat={handleNewChat}
          onRenameChat={handleRenameChat}
          onTogglePinned={handleTogglePinned}
          onDeleteChat={handleDeleteChat}
        />
      </div>

      <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <AiChatList
            chats={chats}
            chatsLoading={chatsLoading}
            activeChatId={activeChatId}
            onSelectChat={(id) => { setActiveChatId(id); setChatListOpen(false); }}
            onNewChat={() => { handleNewChat(); setChatListOpen(false); }}
            onRenameChat={handleRenameChat}
            onTogglePinned={handleTogglePinned}
            onDeleteChat={handleDeleteChat}
            bare
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border flex-wrap">
          <button
            onClick={() => setChatListOpen(true)}
            title="Список диалогов"
            className="lg:hidden h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="PanelLeft" size={16} />
          </button>
          {activeChatTitle && (
            <span className="lg:hidden text-sm font-medium truncate max-w-[140px]">{activeChatTitle}</span>
          )}
          <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg">
            {MODE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleModeChange(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={t.icon} size={13} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setModelFaqOpen(true)}
              title="Как выбрать модель"
              className="h-9 w-9 shrink-0 rounded-lg border border-border bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon name="HelpCircle" size={15} />
            </button>
            <AiModelPicker models={models} modelsLoading={modelsLoading} value={model} onChange={setModel} />
          </div>
        </div>
        {messagesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Icon name="Loader2" size={22} className="animate-spin text-primary" />
          </div>
        ) : (
          <AiMessageList
            messages={messages}
            sending={sending}
            error={sendError}
            mode={mode}
            chatTitle={activeChatTitle || 'Новый чат'}
            onTogglePinned={handleTogglePinnedMessage}
          />
        )}
        {mode === 'image' || mode === 'video' ? (
          <AiGenerateComposer
            mode={mode}
            onGenerate={handleGenerate}
            generating={sending}
            usage={usage}
            limitExceeded={limitExceeded}
          />
        ) : (
          <AiComposer
            mode={mode}
            value={input}
            onChange={setInput}
            onSend={handleSend}
            sending={sending}
            usage={usage}
            limitExceeded={limitExceeded}
            attachments={pendingAttachments}
            onAddFile={handleAddFile}
            onRemoveAttachment={handleRemoveAttachment}
            uploading={uploading}
            uploadProgress={uploadProgress}
            templates={promptTemplates.templates}
            templatesLoading={promptTemplates.loading}
            onManageTemplates={() => setTemplatesManagerOpen(true)}
          />
        )}
      </div>

      {modelFaqOpen && <AiModelFaqModal onClose={() => setModelFaqOpen(false)} />}
      {templatesManagerOpen && (
        <AiTemplatesManager
          templates={promptTemplates.templates}
          loading={promptTemplates.loading}
          onCreate={promptTemplates.createTemplate}
          onUpdate={promptTemplates.updateTemplate}
          onDelete={promptTemplates.deleteTemplate}
          onClose={() => setTemplatesManagerOpen(false)}
        />
      )}
    </div>
  );
}