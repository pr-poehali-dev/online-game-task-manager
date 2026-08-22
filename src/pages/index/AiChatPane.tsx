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
  // Название проекта, если это сессия проекта — ассистент в ней сам ищет по его документам.
  sessionProjectName?: string | null;
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
  sessionProjectName,
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
  // min-h-0 обязателен: без него flex-контейнер не даёт ленте сообщений сжиматься, и выросшее
  // поле ввода выталкивает её (вместе с шапкой) за пределы экрана.
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Шапка. На телефоне ВСЁ помещается в один ряд: кнопки списка/справки слева, вкладки
          режимов прокручиваются в середине, выбор модели — справа. Раньше это занимало два ряда
          (плюс общая шапка приложения = три строки подряд), и на переписку оставалось меньше
          половины экрана. На десктопе раскладка прежняя. */}
      <div className="border-b border-border shrink-0">
        <div className="flex items-center gap-2 px-2 sm:px-4 py-2 sm:py-2.5">
          <button
            onClick={onOpenChatList}
            title="Список диалогов"
            className="lg:hidden h-9 w-9 shrink-0 rounded-full sm:rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="PanelLeft" size={18} />
          </button>
          {sessionProjectName && (
            <span
              title={`Ассистент отвечает по документам проекта «${sessionProjectName}»`}
              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] max-w-[160px]"
            >
              <Icon name="Folder" size={10} className="shrink-0" />
              <span className="truncate">{sessionProjectName}</span>
            </span>
          )}
          {activeChatTitle && (
            <span className="hidden lg:inline text-sm font-medium truncate min-w-0">{activeChatTitle}</span>
          )}
          {/* Вкладки: на телефоне — прокручиваемая лента в середине ряда, на десктопе — группа */}
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-none sm:flex-none sm:gap-1 sm:overflow-visible sm:bg-secondary/60 sm:p-1 sm:rounded-lg">
            {MODE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => onModeChange(t.id)}
                title={t.label}
                className={`shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-full sm:rounded-md text-xs font-medium transition-colors ${
                  mode === t.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/70 sm:bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={t.icon} size={13} />
                {/* На телефоне подпись только у активной вкладки — остальные иконками, иначе
                    лента шире экрана и модель уезжает за край */}
                <span className={mode === t.id ? '' : 'hidden sm:inline'}>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              onClick={onOpenModelFaq}
              title="Как выбрать модель"
              className="hidden sm:flex h-9 w-9 shrink-0 rounded-lg border border-border bg-secondary/60 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:order-first"
            >
              <Icon name="HelpCircle" size={16} />
            </button>
            <AiModelPicker models={models} modelsLoading={modelsLoading} value={model} onChange={onModelChange} onOpenFaq={onOpenModelFaq} />
          </div>
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