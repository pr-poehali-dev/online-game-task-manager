import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { useUndoDelete } from './useUndoDelete';
import AiProjectList from './AiProjectList';
import type { AiProjectsState } from './useAiProjects';
import type { AiChatSummary, AiMessageSearchResult } from './AiTypes';

interface AiChatListProps {
  chats: AiChatSummary[];
  chatsLoading: boolean;
  activeChatId: number | null;
  onSelectChat: (id: number | null) => void;
  onNewChat: () => void;
  onRenameChat: (id: number, title: string) => void;
  onTogglePinned: (id: number, pinned: boolean) => void;
  onDeleteChat: (id: number) => void;
  // onSearchMessages — поиск по СОДЕРЖИМОМУ переписки (backend action=search_messages), в
  // дополнение к локальной фильтрации по названиям диалогов. Результаты показываются отдельным
  // блоком под списком чатов.
  onSearchMessages: (query: string) => Promise<AiMessageSearchResult[]>;
  // onOpenFiles — открыть панель "Мои файлы" (личное хранилище сотрудника в разделе AI с
  // расходом лимита и самостоятельной очисткой, см. AiFilesPanel).
  onOpenFiles: () => void;
  // projects — секция «Проекты» над списком диалогов (личное рабочее пространство сотрудника).
  projects: AiProjectsState;
  // filesUsed/filesLimit — краткий расход лимита файлов прямо на кнопке, чтобы сотрудник видел
  // приближение к пределу до того, как получит отказ при загрузке.
  filesUsed?: number;
  filesLimit?: number;
  // bare — используется внутри мобильного Sheet (Ai.tsx): там уже задана своя ширина/фон
  // контейнера, поэтому убираем фиксированную ширину и правую границу, чтобы список не выглядел
  // "вложенной колонкой внутри колонки".
  bare?: boolean;
  // onClose — показать кнопку закрытия рядом с «Новый чат». Передаётся только из мобильной
  // панели (AiSidebar): на десктопе колонка постоянная и закрывать её не нужно.
  onClose?: () => void;
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
  onSearchMessages,
  onOpenFiles,
  projects,
  filesUsed,
  filesLimit,
  bare = false,
  onClose,
}: AiChatListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');
  const [messageHits, setMessageHits] = useState<AiMessageSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Удаление чата — необратимое действие (переписка стирается на сервере), поэтому не удаляем
  // сразу по клику: строка чата на 5 секунд превращается в плашку "Удаление через: N Вернуть ×",
  // и только когда отсчёт доходит до нуля, вызывается настоящий onDeleteChat.
  const { pending: pendingDelete, scheduleDelete, undo: undoDelete } = useUndoDelete<AiChatSummary>(
    (chat) => onDeleteChat(chat.id)
  );

  // Поиск по переписке идёт на сервер, поэтому запускаем его с задержкой после последнего
  // нажатия клавиши — иначе на каждый символ уходил бы отдельный запрос.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setMessageHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const hits = await onSearchMessages(query);
        if (!cancelled) setMessageHits(hits);
      } catch {
        if (!cancelled) setMessageHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, onSearchMessages]);

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
      {onClose && (
        <div className="flex justify-end px-2 pt-2">
          <button
            onClick={onClose}
            title="Закрыть список"
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
      )}

      <AiProjectList
        projects={projects.projects}
        loading={projects.loading}
        activeProjectId={projects.activeProjectId}
        usedProjects={projects.usedProjects}
        limitProjects={projects.limitProjects}
        error={projects.error}
        onOpenProject={projects.openProject}
        onCreateProject={projects.createProject}
      />

      <div className="p-3 border-b border-border space-y-2">
        {/* «Новый чат» и «Поиск» относятся к списку ДИАЛОГОВ, поэтому стоят под секцией
            проектов, а не над ней: раньше кнопка чата и заголовок «Проекты» читались как одно
            целое и путали. Кнопка закрытия — в ряд с «Новый чат» (штатный крестик Sheet
            позиционируется абсолютно и перекрывал бы её). */}
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Новый чат
          </button>
        </div>
        {chats.length > 0 && (
          <div className="relative">
            <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названиям и тексту…"
              className="w-full h-8 pl-8 pr-7 rounded-lg border border-border bg-secondary/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title="Очистить поиск"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="X" size={12} />
              </button>
            )}
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
        ) : filteredChats.length === 0 && messageHits.length === 0 && !searching ? (
          <div className="text-xs text-muted-foreground text-center py-8 px-2">
            Ничего не найдено по запросу «{search}»
          </div>
        ) : (
          filteredChats.map((chat) => {
            // Чат, для которого сейчас идёт отсчёт отмены — вместо обычной строки показываем
            // плашку "Удаление через: N Вернуть ×" (см. useUndoDelete). Кликнуть на такую строку
            // и открыть уже "удаляемый" чат нельзя — только вернуть его или дождаться удаления.
            if (pendingDelete?.item.id === chat.id) {
              return (
                <div
                  key={chat.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs bg-destructive/10 border border-destructive/20 text-muted-foreground"
                >
                  <span className="flex-1 min-w-0 truncate">
                    Удаление через: {pendingDelete.secondsLeft}
                  </span>
                  <button
                    onClick={undoDelete}
                    className="shrink-0 font-medium text-foreground hover:text-primary transition-colors"
                  >
                    Вернуть
                  </button>
                  <button
                    title="Закрыть"
                    onClick={undoDelete}
                    className="shrink-0 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon name="X" size={13} />
                  </button>
                </div>
              );
            }
            return (
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
                  onClick={(e) => { e.stopPropagation(); scheduleDelete(chat); }}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Icon name="Trash2" size={12} />
                </button>
              </div>
            </div>
            );
          })
        )}

        {/* Найденное в тексте переписки — отдельным блоком под списком диалогов, чтобы не
            путать совпадения по названию чата и по его содержимому. */}
        {search.trim().length >= 2 && (searching || messageHits.length > 0) && (
          <div className="pt-3 mt-2 border-t border-border">
            <div className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              {searching ? <Icon name="Loader2" size={10} className="animate-spin" /> : <Icon name="MessageSquare" size={10} />}
              Найдено в переписке{!searching && messageHits.length > 0 ? `: ${messageHits.length}` : '…'}
            </div>
            {messageHits.map((hit) => (
              <button
                key={hit.messageId}
                onClick={() => onSelectChat(hit.chatId)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="text-[10px] text-muted-foreground truncate mb-0.5 flex items-center gap-1">
                  <Icon name={hit.role === 'user' ? 'User' : 'Sparkles'} size={9} className="shrink-0" />
                  {hit.chatTitle}
                </div>
                <div className="text-xs text-foreground/80 line-clamp-2">{hit.snippet}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* "Мои файлы" — вход в личное хранилище сотрудника: всё, что он загрузил в AI, с расходом
          лимита и возможностью очистить лишнее самому, без обращения к администратору. */}
      <div className="p-2 border-t border-border shrink-0">
        <button
          onClick={onOpenFiles}
          className="w-full h-9 px-2.5 rounded-lg flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <Icon name="FolderCog" size={14} className="shrink-0" />
          <span className="flex-1 text-left">Мои файлы</span>
          {filesLimit != null && filesLimit > 0 && (
            <span className={`shrink-0 text-[10px] ${filesUsed != null && filesUsed >= filesLimit ? 'text-destructive' : ''}`}>
              {filesUsed ?? 0}/{filesLimit}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}