import Icon from '@/components/ui/icon';
import AiModelFaqModal from './AiModelFaqModal';
import AiTemplatesManager from './AiTemplatesManager';
import AiSidebar from './AiSidebar';
import AiChatPane from './AiChatPane';
import AiFilesPanel from './AiFilesPanel';
import AiProjectPage from './AiProjectPage';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAiSection } from './useAiSection';

// Раздел "AI" — общение сотрудников с ИИ-моделями через AI Tunnel (текст, код, изображения,
// видео). Корневой компонент намеренно тонкий: вся состояние-логика живёт в useAiSection.ts,
// разметка разнесена по AiSidebar (список диалогов) и AiChatPane (шапка + лента + композер),
// служебные константы и обёртки над fetch — в aiHelpers.ts. Подробное описание работы раздела:
// docs/ai-section-overview.md.
export default function Ai() {
  const ai = useAiSection();

  if (ai.forbidden) {
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

  // На телефоне чат занимает весь экран без рамки и скруглений — как в мобильных мессенджерах
  // (рамка внутри и без того узкого экрана выглядела «коробкой в коробке», см. скриншот).
  // Отрицательные отступы компенсируют p-3 общего контейнера разделов (IndexMain).
  // На десктопе остаётся прежняя карточка со скруглением и границей.
  //
  // Резерв высоты на телефоне (7.5rem) — это высота шапки IndexTopbar (h-14 = 3.5rem) плюс
  // компенсируемые отрицательным -my-3 отступы контейнера IndexMain (p-3 = 0.75rem сверху и
  // снизу вместе = 1.5rem). Итого фактически занято 5rem — резерв 7.5rem был взят с запасом
  // "на глаз" и оставлял под композером лишние ~40px пустого фона (видно точки декоративного
  // grid-bg на скриншоте пользователя). Правильное значение — 5rem.
  return (
    <div className="flex bg-background sm:bg-card/20 sm:rounded-xl sm:border sm:border-border overflow-hidden h-[calc(100dvh-5rem)] sm:h-[calc(100vh-8.5rem)] -mx-3 -my-3 sm:mx-0 sm:my-0">
      <AiSidebar
        chats={ai.chats}
        chatsLoading={ai.chatsLoading}
        activeChatId={ai.activeChatId}
        chatListOpen={ai.chatListOpen}
        setChatListOpen={ai.setChatListOpen}
        onSelectChat={ai.setActiveChatId}
        onNewChat={ai.handleNewChat}
        onRenameChat={ai.handleRenameChat}
        onTogglePinned={ai.handleTogglePinned}
        onDeleteChat={ai.handleDeleteChat}
        onSearchMessages={ai.handleSearchMessages}
        onOpenFiles={() => ai.setFilesPanelOpen(true)}
        projects={ai.projects}
        filesUsed={ai.files.usedFiles}
        filesLimit={ai.files.limitFiles}
      />

      {/* Когда открыт проект — вместо ленты переписки показывается его страница (файлы, поиск,
          знания, настройки). Список диалогов слева при этом остаётся на месте. */}
      {ai.projects.activeProjectId != null ? (
        <AiProjectPage
          state={ai.projects}
          onOpenChat={ai.handleOpenProjectChat}
          onStartSession={ai.handleStartProjectSession}
          onUploadFile={ai.handleUploadProjectFile}
          uploading={ai.uploading}
          uploadProgress={ai.uploadProgress}
        />
      ) : (
      <AiChatPane
        mode={ai.mode}
        onModeChange={ai.handleModeChange}
        models={ai.models}
        modelsLoading={ai.modelsLoading}
        model={ai.model}
        onModelChange={ai.setModel}
        activeChatTitle={ai.activeChatTitle}
        sessionProjectName={ai.activeSessionProjectName}
        onOpenChatList={() => ai.setChatListOpen(true)}
        onOpenModelFaq={() => ai.setModelFaqOpen(true)}
        messages={ai.messages}
        messagesLoading={ai.messagesLoading}
        sending={ai.sending}
        sendError={ai.sendError}
        onTogglePinnedMessage={ai.handleTogglePinnedMessage}
        onRetry={ai.retryAction ?? undefined}
        onRegenerate={ai.handleRegenerate}
        usage={ai.usage}
        limitExceeded={ai.limitExceeded}
        input={ai.input}
        onInputChange={ai.setInput}
        onSend={ai.handleSend}
        pendingAttachments={ai.pendingAttachments}
        onAddFile={ai.handleAddFile}
        onRemoveAttachment={ai.handleRemoveAttachment}
        uploading={ai.uploading}
        uploadProgress={ai.uploadProgress}
        templates={ai.promptTemplates.templates}
        templatesLoading={ai.promptTemplates.loading}
        onManageTemplates={() => ai.setTemplatesManagerOpen(true)}
        documentFormat={ai.documentFormat}
        onDocumentFormatChange={ai.setDocumentFormat}
        onPickDocumentHint={ai.setInput}
        documentTemplate={ai.documentTemplate}
        onDocumentTemplateChange={ai.setDocumentTemplate}
        onUploadTemplate={ai.handleUploadTemplate}
        onGenerateImage={ai.handleGenerateImage}
        onGenerateVideo={ai.handleGenerateVideo}
      />
      )}

      {/* "Мои файлы" — выезжающая панель поверх чата: личное хранилище сотрудника с деревом
          файлов, расходом лимита и самостоятельной очисткой. */}
      <Sheet open={ai.filesPanelOpen} onOpenChange={ai.setFilesPanelOpen}>
        <SheetContent side="right" className="p-0 w-full sm:w-96 flex flex-col [&>button]:hidden">
          <AiFilesPanel state={ai.files} onClose={() => ai.setFilesPanelOpen(false)} />
        </SheetContent>
      </Sheet>

      {ai.modelFaqOpen && <AiModelFaqModal onClose={() => ai.setModelFaqOpen(false)} />}
      {ai.templatesManagerOpen && (
        <AiTemplatesManager
          templates={ai.promptTemplates.templates}
          loading={ai.promptTemplates.loading}
          onCreate={ai.promptTemplates.createTemplate}
          onUpdate={ai.promptTemplates.updateTemplate}
          onDelete={ai.promptTemplates.deleteTemplate}
          onClose={() => ai.setTemplatesManagerOpen(false)}
        />
      )}
    </div>
  );
}