import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { AI_URL, authHeaders } from './shared';
import AiChatList from './AiChatList';
import AiModelPicker from './AiModelPicker';
import AiMessageList from './AiMessageList';
import AiComposer from './AiComposer';
import { AI_ACTIVE_CHAT_KEY } from './AiTypes';
import type { AiChatSummary, AiMessage, AiModelsMap, AiUsage } from './AiTypes';

const AI_MODEL_KEY = 'ai_last_model';

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'Раздел «AI» вам не доступен — обратитесь к владельцу проекта',
  aitunnel_not_configured: 'Доступ к AI Tunnel не настроен — заполните ключ в разделе «Служебные ключи»',
  aitunnel_unreachable: 'Не удалось связаться с AI Tunnel — попробуйте ещё раз',
  aitunnel_error: 'Модель вернула ошибку — попробуйте другую модель или переформулируйте запрос',
  limit_exceeded: 'Месячный лимит на AI исчерпан',
};

function errorText(err: string, message?: string): string {
  if (err === 'aitunnel_error' && message) return message;
  return ERROR_MESSAGES[err] || 'Не удалось выполнить запрос — попробуйте ещё раз';
}

export default function Ai() {
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
  const [model, setModel] = useState(() => localStorage.getItem(AI_MODEL_KEY) || 'auto');

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => { localStorage.setItem(AI_MODEL_KEY, model); }, [model]);
  useEffect(() => {
    if (activeChatId != null) localStorage.setItem(AI_ACTIVE_CHAT_KEY, String(activeChatId));
    else localStorage.removeItem(AI_ACTIVE_CHAT_KEY);
  }, [activeChatId]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=list_models&group=chat`, { method: 'GET', headers: authHeaders() });
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

  useEffect(() => { loadModels(); loadChats(); loadUsage(); }, [loadModels, loadChats, loadUsage]);

  const loadChat = useCallback(async (chatId: number) => {
    setMessagesLoading(true);
    setSendError('');
    try {
      const res = await fetch(`${AI_URL}?action=get_chat&chatId=${chatId}`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages(data.messages || []);
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

  function handleNewChat() {
    setActiveChatId(null);
    setMessages([]);
    setSendError('');
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');
    setInput('');

    // Оптимистично показываем сообщение пользователя сразу, не дожидаясь ответа модели.
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content, attachments: null, model: null, costRub: null, jobStatus: 'done', createdAt: null }]);

    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'send_message', chatId: activeChatId, model, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(errorText(data.error, data.message));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        if (data.spentRub != null) setUsage({ spentRub: data.spentRub, limitRub: data.limitRub });
        return;
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...data.userMessage, attachments: null, jobStatus: 'done' },
        { ...data.assistantMessage, attachments: null, jobStatus: 'done' },
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
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <Icon name="Sparkles" size={16} className="text-primary" />
          <span className="text-sm font-medium">AI</span>
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
        <AiComposer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          sending={sending}
          usage={usage}
          limitExceeded={limitExceeded}
        />
      </div>
    </div>
  );
}