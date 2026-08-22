import { useCallback, useRef } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import AiChatList from './AiChatList';
import { useEdgeSwipe } from './useEdgeSwipe';
import type { AiChatSummary, AiMessageSearchResult } from './AiTypes';
import type { AiProjectsState } from './useAiProjects';

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
  onOpenFiles: () => void;
  projects: AiProjectsState;
  filesUsed?: number;
  filesLimit?: number;
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
  onOpenFiles,
  projects,
  filesUsed,
  filesLimit,
}: AiSidebarProps) {
  const isMobile = useIsMobile();
  // Координата начала касания на самой панели — для закрытия обратным свайпом.
  const swipeStart = useRef<number | null>(null);
  const openPanel = useCallback(() => setChatListOpen(true), [setChatListOpen]);
  // Свайп от левого края открывает список диалогов — только на телефоне и только когда панель
  // ещё закрыта (закрывается она свайпом обратно средствами самого Sheet).
  useEdgeSwipe(isMobile && !chatListOpen, openPanel);

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
          onOpenFiles={onOpenFiles}
          projects={projects}
          filesUsed={filesUsed}
          filesLimit={filesLimit}
        />
      </div>

      <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
        {/* Закрытие обратным свайпом влево: Sheet построен на Radix Dialog и сам жесты не
            обрабатывает, поэтому вешаем лёгкий обработчик прямо на панель — жест должен
            работать в обе стороны, иначе открыв панель пальцем, закрывать её пришлось бы
            тапом по затемнению. */}
        {/* [&>button]:hidden убирает штатный крестик Sheet: он позиционируется абсолютно в правом
            верхнем углу и накладывался поверх кнопки «Новый чат» (см. скриншот). Вместо него —
            своя кнопка закрытия в одном ряду с кнопкой нового чата (closeButton ниже). */}
        <SheetContent
          side="left"
          className="p-0 w-72 flex flex-col [&>button]:hidden"
          onTouchStart={(e) => { swipeStart.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const start = swipeStart.current;
            if (start == null) return;
            swipeStart.current = null;
            if (start - e.changedTouches[0].clientX > 60) setChatListOpen(false);
          }}
        >
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
            onOpenFiles={() => { onOpenFiles(); setChatListOpen(false); }}
            projects={{ ...projects, openProject: (id) => { projects.openProject(id); setChatListOpen(false); } }}
            filesUsed={filesUsed}
            filesLimit={filesLimit}
            onClose={() => setChatListOpen(false)}
            bare
          />
        </SheetContent>
      </Sheet>
    </>
  );
}