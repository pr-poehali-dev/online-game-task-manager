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
  documentFormat: string;
  onDocumentFormatChange: (format: string) => void;
  onPickDocumentHint: (text: string) => void;
  documentTemplate: AiAttachment | null;
  onDocumentTemplateChange: (attachment: AiAttachment | null) => void;
  onUploadTemplate: (file: File) => void;
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
  documentFormat,
  onDocumentFormatChange,
  onPickDocumentHint,
  documentTemplate,
  onDocumentTemplateChange,
  onUploadTemplate,
  onGenerateImage,
  onGenerateVideo,
}: AiChatPaneProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Шапка. На телефоне всё помещается в ОДИН ряд (кнопка диалогов + выбор модели + справка),
          а вкладки режимов уезжают в отдельную прокручиваемую строку под ним — иначе на узком
          экране они переносились на три ряда и съедали половину высоты, а часть вкладок
          («Видео») вообще обрезалась за краем. На десктопе раскладка прежняя — всё в одну строку. */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5">
          <button
            onClick={onOpenChatList}
            title="Список диалогов"
            className="lg:hidden h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="PanelLeft" size={18} />
          </button>
          {activeChatTitle && (
            <span className="lg:hidden text-sm font-medium truncate min-w-0 flex-1">{activeChatTitle}</span>
          )}
          {/* Вкладки в самой шапке — только на широких экранах */}
          <div className="hidden sm:flex gap-1 bg-secondary/60 p-1 rounded-lg">
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
          <div className="ml-auto flex items-center gap-2 min-w-0">
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
        {/* Вкладки режимов на телефоне: горизонтальная прокрутка, чтобы влезали все пять */}
        <div className="sm:hidden flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-none">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onModeChange(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                mode === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary/60 border-border text-muted-foreground'
              }`}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
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
          onPickDocumentHint={mode === 'document' ? onPickDocumentHint : undefined}
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
          modelInfo={models[model]}
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
          documentFormat={documentFormat}
          onDocumentFormatChange={onDocumentFormatChange}
          hasDocument={messages.some((m) => m.hasDocSpec)}
          documentTemplate={documentTemplate}
          onDocumentTemplateChange={onDocumentTemplateChange}
          onUploadTemplate={onUploadTemplate}
        />
      )}
    </div>
  );
}