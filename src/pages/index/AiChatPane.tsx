import Icon from '@/components/ui/icon';
import AiModelPicker from './AiModelPicker';
import AiMessageList from './AiMessageList';
import AiComposer from './AiComposer';
import AiGenerateComposer from './AiGenerateComposer';
import type { ImageGenerateParams, VideoGenerateParams } from './AiGenerateComposer';
import { MODE_TABS } from './AiTypes';
import type { AiMessage, AiModelsMap, AiUsage, AiAttachment, AiMode } from './AiTypes';
import type { AiPromptTemplate } from './AiPromptTemplates';

interface AiChatPaneProps {
  mode: AiMode;
  onModeChange: (next: AiMode) => void;
  models: AiModelsMap;
  modelsLoading: boolean;
  model: string;
  onModelChange: (model: string) => void;
  activeChatTitle?: string;
  onOpenChatList: () => void;
  onOpenModelFaq: () => void;
  messages: AiMessage[];
  messagesLoading: boolean;
  sending: boolean;
  sendError: string;
  onTogglePinnedMessage: (messageId: number, pinned: boolean) => void;
  onRetry?: () => void;
  onRegenerate: () => void;
  usage: AiUsage | null;
  limitExceeded: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  pendingAttachments: AiAttachment[];
  onAddFile: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  uploading: boolean;
  uploadProgress: number | null;
  templates: AiPromptTemplate[];
  templatesLoading: boolean;
  onManageTemplates: () => void;
  onGenerateImage: (params: ImageGenerateParams) => void;
  onGenerateVideo: (params: VideoGenerateParams) => void;
}

// AiChatPane — правая (основная) область раздела: шапка с переключателем режимов и выбором
// модели, лента сообщений и композер. Композер подставляется по режиму: текстовый для chat/code,
// с параметрами генерации для image/video.
export default function AiChatPane({
  mode,
  onModeChange,
  models,
  modelsLoading,
  model,
  onModelChange,
  activeChatTitle,
  onOpenChatList,
  onOpenModelFaq,
  messages,
  messagesLoading,
  sending,
  sendError,
  onTogglePinnedMessage,
  onRetry,
  onRegenerate,
  usage,
  limitExceeded,
  input,
  onInputChange,
  onSend,
  pendingAttachments,
  onAddFile,
  onRemoveAttachment,
  uploading,
  uploadProgress,
  templates,
  templatesLoading,
  onManageTemplates,
  onGenerateImage,
  onGenerateVideo,
}: AiChatPaneProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border flex-wrap">
        <button
          onClick={onOpenChatList}
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
              onClick={() => onModeChange(t.id)}
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
            onClick={onOpenModelFaq}
            title="Как выбрать модель"
            className="h-9 w-9 shrink-0 rounded-lg border border-border bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="HelpCircle" size={15} />
          </button>
          <AiModelPicker models={models} modelsLoading={modelsLoading} value={model} onChange={onModelChange} />
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
          onTogglePinned={onTogglePinnedMessage}
          onRetry={onRetry}
          onRegenerate={mode === 'chat' || mode === 'code' ? onRegenerate : undefined}
        />
      )}
      {mode === 'image' || mode === 'video' ? (
        <AiGenerateComposer
          mode={mode}
          onGenerateImage={onGenerateImage}
          onGenerateVideo={onGenerateVideo}
          generating={sending}
          usage={usage}
          limitExceeded={limitExceeded}
        />
      ) : (
        <AiComposer
          mode={mode}
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          sending={sending}
          usage={usage}
          limitExceeded={limitExceeded}
          attachments={pendingAttachments}
          onAddFile={onAddFile}
          onRemoveAttachment={onRemoveAttachment}
          uploading={uploading}
          uploadProgress={uploadProgress}
          templates={templates}
          templatesLoading={templatesLoading}
          onManageTemplates={onManageTemplates}
        />
      )}
    </div>
  );
}
