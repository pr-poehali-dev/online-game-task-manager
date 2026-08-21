import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { IMAGE_ASPECT_RATIOS, VIDEO_DURATIONS, IMAGE_QUALITY_OPTIONS, IMAGE_OUTPUT_FORMATS, IMAGE_COUNT_OPTIONS } from './AiTypes';
import { useAutosizeTextarea } from './useAutosizeTextarea';
import { uploadAiAttachment } from './aiUploadApi';
import type { AiUsage, AiAttachment } from './AiTypes';

const COMPACT_MAX_HEIGHT = 160;
const EXPANDED_MAX_HEIGHT = 480;

export interface ImageGenerateParams {
  prompt: string;
  aspectRatio: string;
  n: number;
  quality: string;
  outputFormat: string;
  transparentBackground: boolean;
  inputReferences: AiAttachment[];
}

export interface VideoGenerateParams {
  prompt: string;
  duration: number;
}

interface AiGenerateComposerProps {
  mode: 'image' | 'video';
  onGenerateImage: (params: ImageGenerateParams) => void;
  onGenerateVideo: (params: VideoGenerateParams) => void;
  generating: boolean;
  usage: AiUsage | null;
  limitExceeded: boolean;
}

export default function AiGenerateComposer({ mode, onGenerateImage, onGenerateVideo, generating, usage, limitExceeded }: AiGenerateComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [n, setN] = useState(1);
  const [quality, setQuality] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  // transparentBackground — доступно не у всех моделей изображений (см. supported_background в
  // каталоге), но т.к. параметр универсальный и модели без поддержки его просто игнорируют (см.
  // docs/ai-tunnel-api-reference.md), не проверяем конкретную модель — либо сработает, либо нет.
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [referenceImages, setReferenceImages] = useState<AiAttachment[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const maxHeight = expanded ? EXPANDED_MAX_HEIGHT : COMPACT_MAX_HEIGHT;
  useAutosizeTextarea(textareaRef, prompt, maxHeight, expanded);

  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;

  async function handleAddReference(file: File) {
    setUploadingRef(true);
    try {
      const attachment = await uploadAiAttachment(file);
      setReferenceImages((prev) => [...prev, attachment]);
    } catch {
      /* молча игнорируем — сотрудник увидит, что превью не появилось, и попробует другой файл */
    } finally {
      setUploadingRef(false);
    }
  }

  function handleSubmit() {
    if (!prompt.trim() || generating || limitExceeded) return;
    if (mode === 'image') {
      onGenerateImage({
        prompt: prompt.trim(), aspectRatio, n, quality, outputFormat,
        transparentBackground, inputReferences: referenceImages,
      });
      setReferenceImages([]);
    } else {
      onGenerateVideo({ prompt: prompt.trim(), duration });
    }
    setPrompt('');
  }

  return (
    <div className="border-t border-border p-3 sm:p-4">
      {usage && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div
              className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <span>Потрачено {usage.spentRub.toFixed(2)} ₽ из {usage.limitRub.toFixed(0)} ₽ в этом месяце</span>
        </div>
      )}
      {limitExceeded && (
        <div className="mb-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} />
          Месячный лимит на AI исчерпан — обратитесь к администратору для увеличения лимита
        </div>
      )}
      {mode === 'video' && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Генерация видео платная сразу при запуске — отменить или вернуть деньги за уже начатую генерацию нельзя
        </div>
      )}

      {mode === 'image' && referenceImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {referenceImages.map((a) => (
            <div key={a.id} className="relative group">
              <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover border border-border" />
              <button
                onClick={() => setReferenceImages((prev) => prev.filter((r) => r.id !== a.id))}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon name="X" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {mode === 'image' ? (
          <>
            <div className="flex items-center gap-1.5">
              <Icon name="RectangleHorizontal" size={13} className="text-muted-foreground" />
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {IMAGE_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="Copy" size={13} className="text-muted-foreground" />
              <select
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                title="Количество изображений"
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {IMAGE_COUNT_OPTIONS.map((c) => <option key={c} value={c}>{c} шт.</option>)}
              </select>
            </div>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              title="Качество"
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {IMAGE_QUALITY_OPTIONS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              title="Формат файла"
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {IMAGE_OUTPUT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setTransparentBackground((v) => !v)}
              title="Прозрачный фон (поддерживают не все модели)"
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                transparentBackground ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="Grid2x2" size={12} />
              Прозрачный фон
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddReference(f); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingRef}
              title="Прикрепить фото для редактирования (image-to-image)"
              className="h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploadingRef ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Paperclip" size={12} />}
              Референс
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Icon name="Timer" size={13} className="text-muted-foreground" />
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d} сек</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            disabled={generating || limitExceeded}
            placeholder={
              mode === 'image'
                ? referenceImages.length > 0
                  ? 'Опишите, что изменить в прикреплённом фото…'
                  : 'Опишите изображение, которое нужно сгенерировать…'
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
          onClick={handleSubmit}
          disabled={generating || limitExceeded || !prompt.trim()}
          className="h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {generating ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Wand2" size={16} />}
        </button>
      </div>
    </div>
  );
}
