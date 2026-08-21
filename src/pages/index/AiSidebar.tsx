import { Sheet, SheetContent } from '@/components/ui/sheet';
import AiChatList from './AiChatList';
import type { AiChatSummary, AiMessageSearchResult } from './AiTypes';

interface AiSidebarProps {
  chats: AiChatSummary[];
  chatsLoading: boolean;
  activeChatId: number | null;
  chatListOpen: boolean;
  setChatListOpen: (open: boolean) => void;
  onSelectChat: (id: number | null) => void;
  onNewChat: () => void;
  onRenameChat: (id: number, title: string) => void;
  onTogglePinned: (id: number, pinned: boolean) => void;
  onDeleteChat: (id: number) => void;
  onSearchMessages: (query: string) => Promise<AiMessageSearchResult[]>;
}

// AiSidebar — левая колонка со списком диалогов в двух вариантах отображения: постоянная колонка
// на десктопе (lg+) и выезжающая панель Sheet на мобильных. Один и тот же AiChatList с
// одинаковыми обработчиками, отличается только обёртка и закрытие панели после выбора.
export default function AiSidebar({
  chats,
  chatsLoading,
  activeChatId,
  chatListOpen,
  setChatListOpen,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onTogglePinned,
  onDeleteChat,
  onSearchMessages,
}: AiSidebarProps) {
  return (
    <>
      <div className="hidden lg:flex">
        <AiChatList
          chats={chats}
          chatsLoading={chatsLoading}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          onRenameChat={onRenameChat}
          onTogglePinned={onTogglePinned}
          onDeleteChat={onDeleteChat}
          onSearchMessages={onSearchMessages}
        />
      </div>

      <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <AiChatList
            chats={chats}
            chatsLoading={chatsLoading}
            activeChatId={activeChatId}
            onSelectChat={(id) => { onSelectChat(id); setChatListOpen(false); }}
            onNewChat={() => { onNewChat(); setChatListOpen(false); }}
            onRenameChat={onRenameChat}
            onTogglePinned={onTogglePinned}
            onDeleteChat={onDeleteChat}
            onSearchMessages={onSearchMessages}
            bare
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
