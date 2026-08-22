import Icon from '@/components/ui/icon';
import AiModelFaqModal from './AiModelFaqModal';
import AiTemplatesManager from './AiTemplatesManager';
import AiSidebar from './AiSidebar';
import AiChatPane from './AiChatPane';
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

  return (
    <div className="flex rounded-xl border border-border overflow-hidden bg-card/20 h-[calc(100vh-8.5rem)]">
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
      />

      <AiChatPane
        mode={ai.mode}
        onModeChange={ai.handleModeChange}
        models={ai.models}
        modelsLoading={ai.modelsLoading}
        model={ai.model}
        onModelChange={ai.setModel}
        activeChatTitle={ai.activeChatTitle}
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
        onGenerateImage={ai.handleGenerateImage}
        onGenerateVideo={ai.handleGenerateVideo}
      />

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
