import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { AI_URL, authHeaders } from './shared';
import AiChatList from './AiChatList';
import AiModelPicker from './AiModelPicker';
import AiMessageList from './AiMessageList';
import AiComposer from './AiComposer';
import AiGenerateComposer from './AiGenerateComposer';
import { AI_ACTIVE_CHAT_KEY, MODE_TABS } from './AiTypes';
import type { AiChatSummary, AiMessage, AiModelsMap, AiUsage, AiAttachment, AiMode } from './AiTypes';

const AI_MODEL_KEY_PREFIX = 'ai_last_model_';
const VIDEO_POLL_INTERVAL = 6000;

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'Раздел «AI» вам не доступен — обратитесь к владельцу проекта',
  aitunnel_not_configured: 'Доступ к AI Tunnel не настроен — заполните ключ в разделе «Служебные ключи»',
  aitunnel_unreachable: 'Не удалось связаться с AI Tunnel — попробуйте ещё раз',
  aitunnel_error: 'Модель вернула ошибку — попробуйте другую модель или переформулируйте запрос',
  limit_exceeded: 'Месячный лимит на AI исчерпан',
  file_too_large: 'Файл слишком большой (максимум 30 МБ)',
  no_data: 'Не удалось прочитать файл',
};

function errorText(err: string, message?: string): string {
  if (err === 'aitunnel_error' && message) return message;
  return ERROR_MESSAGES[err] || 'Не удалось выполнить запрос — попробуйте ещё раз';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    try {
      const dataUrl = await fileToBase64(file);
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'upload_attachment', data: dataUrl, name: file.name, contentType: file.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.attachment) {
        setPendingAttachments((prev) => [...prev, data.attachment]);
      } else {
        setSendError(errorText(data.error));
      }
    } catch {
      setSendError('Не удалось загрузить файл — проверьте соединение');
    } finally {
      setUploading(false);
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
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content, attachments: attachmentsToSend.length ? attachmentsToSend : null, model: null, costRub: null, jobStatus: 'done', createdAt: null }]);

    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'send_message', chatId: activeChatId, model, content, mode, attachments: attachmentsToSend }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        setPendingAttachments(attachmentsToSend);
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, jobStatus: 'done' },
        { ...data.assistantMessage, attachments: data.assistantMessage.attachments || null, jobStatus: 'done' },
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
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: params.prompt, attachments: null, model: null, costRub: null, jobStatus: 'done', createdAt: null }]);

    try {
      const action = mode === 'image' ? 'generate_image' : 'generate_video';
      const body: Record<string, unknown> = { action, chatId: activeChatId, model, prompt: params.prompt };
      if (mode === 'image') body.aspectRatio = params.aspectRatio;
      if (mode === 'video') body.duration = params.duration;

      const res = await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, jobStatus: 'done' },
        { ...data.assistantMessage, attachments: data.assistantMessage.attachments || null, jobStatus: data.assistantMessage.jobStatus || 'done' },
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

  return (
    <div className="flex rounded-xl border border-border overflow-hidden bg-card/20 h-[calc(100vh-8.5rem)]">
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
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
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
          <div className="ml-auto">
            <AiModelPicker models={models} modelsLoading={modelsLoading} value={model} onChange={setModel} />
          </div>
        </div>
        {messagesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Icon name="Loader2" size={22} className="animate-spin text-primary" />
          </div>
        ) : (
          <AiMessageList messages={messages} sending={sending} error={sendError} />
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
          />
        )}
      </div>
    </div>
  );
}
