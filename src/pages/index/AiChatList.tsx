import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { AiChatSummary } from './AiTypes';

interface AiChatListProps {
  chats: AiChatSummary[];
  chatsLoading: boolean;
  activeChatId: number | null;
  onSelectChat: (id: number | null) => void;
  onNewChat: () => void;
  onRenameChat: (id: number, title: string) => void;
  onTogglePinned: (id: number, pinned: boolean) => void;
  onDeleteChat: (id: number) => void;
  // bare — используется внутри мобильного Sheet (Ai.tsx): там уже задана своя ширина/фон
  // контейнера, поэтому убираем фиксированную ширину и правую границу, чтобы список не выглядел
  // "вложенной колонкой внутри колонки".
  bare?: boolean;
}

export default function AiChatList({
  chats,
  chatsLoading,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onTogglePinned,
  onDeleteChat,
  bare = false,
}: AiChatListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');

  function startEdit(chat: AiChatSummary) {
    setEditingId(chat.id);
    setEditValue(chat.title);
  }

  function commitEdit() {
    if (editingId != null && editValue.trim()) {
      onRenameChat(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  const filteredChats = search.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()))
    : chats;

  return (
    <div className={bare ? 'flex flex-col h-full' : 'w-64 shrink-0 border-r border-border flex flex-col h-full'}>
      <div className="p-3 border-b border-border space-y-2">
        <button
          onClick={onNewChat}
          className="w-full h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <Icon name="Plus" size={15} />
          Новый чат
        </button>
        {chats.length > 4 && (
          <div className="relative">
            <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по диалогам…"
              className="w-full h-8 pl-8 pr-2 rounded-lg border border-border bg-secondary/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
        {chatsLoading ? (
          <div className="py-8 flex justify-center">
            <Icon name="Loader2" size={18} className="animate-spin text-primary" />
          </div>
        ) : chats.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 px-2">
            Пока нет ни одного диалога — начните новый чат
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 px-2">
            Ничего не найдено по запросу «{search}»
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                activeChatId === chat.id ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-secondary/50'
              }`}
            >
              {chat.pinned && <Icon name="Pin" size={11} className="shrink-0 opacity-70" />}
              {editingId === chat.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-transparent border-b border-primary text-sm outline-none"
                />
              ) : (
                <span className="flex-1 min-w-0 truncate">{chat.title}</span>
              )}
              {/* На touch-устройствах (нет hover) кнопки видны всегда — иначе на телефоне их
                  вообще нельзя нажать; на десктопе (lg+) появляются по наведению, чтобы не
                  захламлять список. */}
              <div className="flex lg:hidden lg:group-hover:flex items-center gap-0.5 shrink-0">
                <button
                  title={chat.pinned ? 'Открепить' : 'Закрепить'}
                  onClick={(e) => { e.stopPropagation(); onTogglePinned(chat.id, !chat.pinned); }}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Icon name="Pin" size={12} />
                </button>
                <button
                  title="Переименовать"
                  onClick={(e) => { e.stopPropagation(); startEdit(chat); }}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Icon name="Pencil" size={12} />
                </button>
                <button
                  title="Удалить"
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Icon name="Trash2" size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}