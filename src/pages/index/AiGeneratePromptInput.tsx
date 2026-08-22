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
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
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
                : 'Опишите изображение, которое нужно сгенерировать…'
              : frameImages.length > 0
                ? 'Опишите, что должно происходить в кадре…'
                : referenceImages.some((r) => r.contentType.startsWith('video/'))
                  ? 'Опишите, что изменить в исходном видео…'
                  : 'Опишите видео, которое нужно сгенерировать…'
          }
          rows={1}
          className="w-full resize-none rounded-lg border border-border bg-background pl-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 overflow-y-auto scrollbar-thin transition-[height]"
          style={{ minHeight: '42px', maxHeight }}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Свернуть поле' : 'Увеличить поле'}
          className="absolute right-1.5 bottom-1.5 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={13} />
        </button>
      </div>
      <button
        onClick={onSubmit}
        disabled={generating || limitExceeded || !prompt.trim()}
        className="h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {generating ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Wand2" size={16} />}
      </button>
    </div>
  );
}
