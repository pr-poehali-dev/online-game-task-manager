import type { RefObject } from 'react';
import Icon from '@/components/ui/icon';
import type { AiAttachment } from './AiTypes';

interface AiGeneratePromptInputProps {
  mode: 'image' | 'video';
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  generating: boolean;
  limitExceeded: boolean;
  expanded: boolean;
  setExpanded: (updater: (v: boolean) => boolean) => void;
  maxHeight: number;
  textareaRef: RefObject<HTMLTextAreaElement>;
  referenceImages: AiAttachment[];
  frameImages: (AiAttachment & { frameType: string })[];
}

// Поле ввода промпта с кнопкой разворота и кнопкой запуска генерации. Разметка, подсказка
// placeholder и поведение клавиш перенесены из AiGenerateComposer без изменений.
export default function AiGeneratePromptInput({
  mode, prompt, setPrompt, onSubmit, generating, limitExceeded,
  expanded, setExpanded, maxHeight, textareaRef, referenceImages, frameImages,
}: AiGeneratePromptInputProps) {
  return (
    <div className="rounded-[22px] border border-border bg-background p-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:flex sm:items-end sm:gap-2">
      <div className="relative sm:flex-1 sm:min-w-0">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          disabled={generating || limitExceeded}
          placeholder={
            mode === 'image'
              ? referenceImages.length > 0
                ? 'Опишите, что изменить в прикреплённом фото…'
                : 'Опишите изображение…'
              : frameImages.length > 0
                ? 'Опишите, что должно происходить в кадре…'
                : referenceImages.some((r) => r.contentType.startsWith('video/'))
                  ? 'Опишите, что изменить в исходном видео…'
                  : 'Опишите видео…'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-2.5 pt-1.5 pb-0.5 text-base focus:outline-none disabled:opacity-60 overflow-y-auto scrollbar-thin transition-[height] sm:rounded-lg sm:border sm:border-border sm:bg-background sm:px-3 sm:pr-10 sm:py-2.5 sm:text-sm sm:focus:ring-1 sm:focus:ring-primary"
          style={{ minHeight: '32px', maxHeight }}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Свернуть поле' : 'Увеличить поле'}
          className="hidden sm:flex absolute right-2 bottom-2 h-7 w-7 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={14} />
        </button>
      </div>
      {/* Нижний ряд капсулы (только телефон) — как в AiComposer */}
      <div className="flex items-center gap-1 sm:hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Свернуть поле' : 'Увеличить поле'}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={16} />
        </button>
        <button
          onClick={onSubmit}
          disabled={generating || limitExceeded || !prompt.trim()}
          className="ml-auto h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {generating ? <Icon name="Loader2" size={17} className="animate-spin" /> : <Icon name="ArrowUp" size={18} />}
        </button>
      </div>
      <button
        onClick={onSubmit}
        disabled={generating || limitExceeded || !prompt.trim()}
        className="hidden sm:flex h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {generating ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Wand2" size={16} />}
      </button>
    </div>
  );
}
