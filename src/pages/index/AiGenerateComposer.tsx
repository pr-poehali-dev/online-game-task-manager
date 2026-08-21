import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { IMAGE_COUNT_OPTIONS, imageModelCapabilities, videoModelCapabilities } from './AiTypes';
import { useAutosizeTextarea } from './useAutosizeTextarea';
import { uploadAiAttachment } from './aiUploadApi';
import type { AiUsage, AiAttachment, AiModelInfo } from './AiTypes';

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
  aspectRatio: string;
  resolution: string;
  /** false — явно выключить звук у модели, которая это умеет. */
  generateAudio: boolean;
  /** Опорные кадры image-to-video: с какого начать и каким закончить. */
  frameImages: (AiAttachment & { frameType: string })[];
  /** Референсы стиля/содержания, а для video-to-video моделей — исходный ролик. */
  inputReferences: AiAttachment[];
}

interface AiGenerateComposerProps {
  mode: 'image' | 'video';
  onGenerateImage: (params: ImageGenerateParams) => void;
  onGenerateVideo: (params: VideoGenerateParams) => void;
  generating: boolean;
  usage: AiUsage | null;
  limitExceeded: boolean;
  // modelInfo — описание ВЫБРАННОЙ модели из каталога AI Tunnel. По нему скрываем параметры,
  // которых у модели нет, чтобы не отправлять заведомо невалидный запрос (см.
  // imageModelCapabilities в AiTypes.ts).
  modelInfo?: AiModelInfo;
}

// Параметры генерации запоминаются между запусками и перезагрузками страницы: сотрудник обычно
// работает сериями однотипных картинок (одно соотношение сторон, один формат), и выставлять всё
// заново на каждый запрос — лишняя рутина. Ключи с префиксом, чтобы не пересекаться с другими
// настройками раздела (ai_last_model_*, ai_active_chat_id).
const PARAM_KEY = 'ai_gen_params_';

function savedText(key: string, fallback: string): string {
  return localStorage.getItem(PARAM_KEY + key) ?? fallback;
}

function savedNumber(key: string, fallback: number): number {
  return Number(localStorage.getItem(PARAM_KEY + key)) || fallback;
}

export default function AiGenerateComposer({ mode, onGenerateImage, onGenerateVideo, generating, usage, limitExceeded, modelInfo }: AiGenerateComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState(() => savedText('aspectRatio', '16:9'));
  const [duration, setDuration] = useState(() => savedNumber('duration', 5));
  const [n, setN] = useState(() => savedNumber('n', 1));
  const [quality, setQuality] = useState(() => savedText('quality', ''));
  const [outputFormat, setOutputFormat] = useState(() => savedText('outputFormat', ''));
  // transparentBackground — доступно не у всех моделей изображений (см. supported_background в
  // каталоге), но т.к. параметр универсальный и модели без поддержки его просто игнорируют (см.
  // docs/ai-tunnel-api-reference.md), не проверяем конкретную модель — либо сработает, либо нет.
  const [transparentBackground, setTransparentBackground] = useState(() => savedText('background', '') === 'transparent');
  const [referenceImages, setReferenceImages] = useState<AiAttachment[]>([]);
  // Параметры видео. frameImages — опорные кадры (первый/последний), referenceImages переиспользуем
  // как референсы стиля и как исходный ролик для video-to-video (тип определяется по contentType).
  const [videoAspect, setVideoAspect] = useState(() => savedText('videoAspect', ''));
  const [videoResolution, setVideoResolution] = useState(() => savedText('videoResolution', ''));
  const [videoAudio, setVideoAudio] = useState(() => savedText('videoAudio', 'on') === 'on');
  const [frameImages, setFrameImages] = useState<(AiAttachment & { frameType: string })[]>([]);
  const frameInputRef = useRef<HTMLInputElement>(null);
  const pendingFrameType = useRef<string>('first_frame');
  const [uploadingRef, setUploadingRef] = useState(false);
  // refError — ошибка загрузки референсного фото. Раньше молча игнорировалась (пустой catch), и
  // сотрудник просто не понимал, почему превью не появилось — теперь текст ошибки виден прямо
  // над панелью параметров (см. docs/ai-section-overview.md, план доработок п. 1.3).
  const [refError, setRefError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const maxHeight = expanded ? EXPANDED_MAX_HEIGHT : COMPACT_MAX_HEIGHT;
  useAutosizeTextarea(textareaRef, prompt, maxHeight, expanded);

  const caps = imageModelCapabilities(modelInfo);
  const countOptions = IMAGE_COUNT_OPTIONS.filter((c) => c <= caps.maxCount);
  const vcaps = videoModelCapabilities(modelInfo);

  // При смене модели ранее выбранное значение может оказаться недопустимым (например, было 16:9,
  // а новая модель поддерживает только 1:1) — молча приводим к первому доступному, иначе запрос
  // ушёл бы с невалидным параметром и упал с 400.
  useEffect(() => {
    if (caps.aspectRatios.length > 0 && !caps.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(caps.aspectRatios[0]);
    }
    if (quality && !caps.qualities.some((q) => q.value === quality)) setQuality('');
    if (outputFormat && !caps.outputFormats.some((f) => f.value === outputFormat)) setOutputFormat('');
    if (transparentBackground && !caps.supportsTransparent) setTransparentBackground(false);
    if (n > caps.maxCount) setN(1);
    // Видео: длительность/соотношение/разрешение у моделей разные — приводим к допустимым.
    if (!vcaps.durations.includes(duration)) setDuration(vcaps.durations[0]);
    if (videoAspect && !vcaps.aspectRatios.includes(videoAspect)) setVideoAspect('');
    if (videoResolution && !vcaps.resolutions.includes(videoResolution)) setVideoResolution('');
    if (frameImages.length && vcaps.frameTypes.length === 0) setFrameImages([]);
  }, [modelInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem(PARAM_KEY + 'aspectRatio', aspectRatio); }, [aspectRatio]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'duration', String(duration)); }, [duration]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'n', String(n)); }, [n]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'quality', quality); }, [quality]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'outputFormat', outputFormat); }, [outputFormat]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'background', transparentBackground ? 'transparent' : ''); }, [transparentBackground]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'videoAspect', videoAspect); }, [videoAspect]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'videoResolution', videoResolution); }, [videoResolution]);
  useEffect(() => { localStorage.setItem(PARAM_KEY + 'videoAudio', videoAudio ? 'on' : 'off'); }, [videoAudio]);

  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;

  async function handleAddReference(file: File) {
    setUploadingRef(true);
    setRefError('');
    try {
      const attachment = await uploadAiAttachment(file);
      setReferenceImages((prev) => [...prev, attachment]);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setRefError(
        code === 'file_too_large'
          ? 'Фото слишком большое — максимум 200 МБ'
          : 'Не удалось загрузить фото — проверьте соединение и попробуйте ещё раз'
      );
    } finally {
      setUploadingRef(false);
    }
  }

  // Загрузка опорного кадра для видео (первый или последний). Тип кадра запоминается в
  // pendingFrameType до открытия файлового диалога — иначе после выбора файла уже не понять,
  // какую именно кнопку нажимали.
  async function handleAddFrame(file: File) {
    setUploadingRef(true);
    setRefError('');
    try {
      const attachment = await uploadAiAttachment(file);
      const frameType = pendingFrameType.current;
      setFrameImages((prev) => [...prev.filter((f) => f.frameType !== frameType), { ...attachment, frameType }]);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setRefError(
        code === 'file_too_large'
          ? 'Файл слишком большой — максимум 200 МБ'
          : 'Не удалось загрузить кадр — проверьте соединение и попробуйте ещё раз'
      );
    } finally {
      setUploadingRef(false);
    }
  }

  function handleSubmit() {
    if (!prompt.trim() || generating || limitExceeded) return;
    if (mode === 'image') {
      onGenerateImage({
        // Параметры, которых у модели нет, отправляем пустыми — backend их просто не положит в
        // запрос к AI Tunnel (см. handle_generate_image: `if aspect_ratio:` и т.д.).
        prompt: prompt.trim(),
        aspectRatio: caps.aspectRatios.length > 0 ? aspectRatio : '',
        n, quality, outputFormat,
        transparentBackground, inputReferences: referenceImages,
      });
      setReferenceImages([]);
    } else {
      onGenerateVideo({
        prompt: prompt.trim(), duration,
        aspectRatio: videoAspect, resolution: videoResolution,
        // Звук передаём как false только у моделей, где переключатель реально есть.
        generateAudio: vcaps.canToggleAudio ? videoAudio : true,
        frameImages, inputReferences: vcaps.supportsReferences ? referenceImages : [],
      });
      setFrameImages([]);
      setReferenceImages([]);
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

      {mode === 'image' && n > 1 && countOptions.length > 1 && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Не все модели умеют делать несколько вариантов за раз — некоторые вернут одно изображение, даже если запрошено больше
        </div>
      )}
      {refError && (
        <div className="mb-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} className="shrink-0" />
          {refError}
        </div>
      )}

      {(referenceImages.length > 0 || frameImages.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {/* Опорные кадры подписаны, чтобы было видно, какой из них первый, а какой последний. */}
          {frameImages.map((a) => (
            <div key={a.id} className="relative group">
              <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover border border-primary/50" />
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] text-center rounded-b-lg py-0.5">
                {a.frameType === 'last_frame' ? 'финал' : 'старт'}
              </span>
              <button
                onClick={() => setFrameImages((prev) => prev.filter((r) => r.id !== a.id))}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon name="X" size={10} />
              </button>
            </div>
          ))}
          {referenceImages.map((a) => (
            <div key={a.id} className="relative group">
              {a.contentType.startsWith('video/') ? (
                <div className="h-14 w-14 rounded-lg border border-border bg-secondary flex items-center justify-center">
                  <Icon name="Clapperboard" size={18} className="text-muted-foreground" />
                </div>
              ) : (
                <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover border border-border" />
              )}
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

      {/* Один скрытый файловый ввод на оба режима: в картинках это референс для правки, в видео —
          референс стиля или исходный ролик. Для видео с video-to-video разрешаем и видеофайлы. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={mode === 'video' && vcaps.supportsVideoInput ? 'image/*,video/*' : 'image/*'}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddReference(f); e.target.value = ''; }}
      />

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {mode === 'image' ? (
          <>
            {/* Каждый параметр показывается, только если ВЫБРАННАЯ модель его поддерживает
                (данные из каталога AI Tunnel, см. imageModelCapabilities). Иначе запрос уходил бы
                с параметром, который модель не принимает, и падал с 400. */}
            {caps.aspectRatios.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Icon name="RectangleHorizontal" size={13} className="text-muted-foreground" />
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  disabled={referenceImages.length > 0}
                  title={referenceImages.length > 0 ? 'При редактировании по референсу сохраняются пропорции исходного фото' : 'Соотношение сторон'}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {caps.aspectRatios.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {countOptions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <Icon name="Copy" size={13} className="text-muted-foreground" />
                <select
                  value={n}
                  onChange={(e) => setN(Number(e.target.value))}
                  title="Количество изображений"
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {countOptions.map((c) => <option key={c} value={c}>{c} шт.</option>)}
                </select>
              </div>
            )}
            {caps.qualities.length > 0 && (
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                title="Качество"
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {caps.qualities.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            )}
            {caps.outputFormats.length > 0 && (
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                title="Формат файла"
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {caps.outputFormats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            )}
            {caps.supportsTransparent && (
            <button
              type="button"
              onClick={() => setTransparentBackground((v) => !v)}
              title="Прозрачный фон"
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                transparentBackground ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="Grid2x2" size={12} />
              Прозрачный фон
            </button>
            )}
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
          <>
            {/* Набор параметров видео тоже зависит от выбранной модели: длительности, соотношения
                сторон и разрешения у всех разные (veo-3.1 — только 4/6/8 сек), опорные кадры и
                референсы поддерживает лишь часть моделей. См. videoModelCapabilities. */}
            <div className="flex items-center gap-1.5">
              <Icon name="Timer" size={13} className="text-muted-foreground" />
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                title="Длительность"
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {vcaps.durations.map((d) => <option key={d} value={d}>{d} сек</option>)}
              </select>
            </div>
            {vcaps.aspectRatios.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Icon name="RectangleHorizontal" size={13} className="text-muted-foreground" />
                <select
                  value={videoAspect}
                  onChange={(e) => setVideoAspect(e.target.value)}
                  title="Соотношение сторон"
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Авто</option>
                  {vcaps.aspectRatios.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {vcaps.resolutions.length > 0 && (
              <select
                value={videoResolution}
                onChange={(e) => setVideoResolution(e.target.value)}
                title="Качество видео"
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Авто</option>
                {vcaps.resolutions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            {vcaps.canToggleAudio && (
              <button
                type="button"
                onClick={() => setVideoAudio((v) => !v)}
                title={videoAudio ? 'Видео будет со звуком' : 'Видео будет без звука'}
                className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  videoAudio ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={videoAudio ? 'Volume2' : 'VolumeX'} size={12} />
                {videoAudio ? 'Со звуком' : 'Без звука'}
              </button>
            )}
            <input
              ref={frameInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddFrame(f); e.target.value = ''; }}
            />
            {vcaps.frameTypes.includes('first_frame') && (
              <button
                type="button"
                onClick={() => { pendingFrameType.current = 'first_frame'; frameInputRef.current?.click(); }}
                disabled={uploadingRef}
                title="Картинка, с которой начнётся видео (оживить фото)"
                className="h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="ImagePlus" size={12} />
                Первый кадр
              </button>
            )}
            {vcaps.frameTypes.includes('last_frame') && (
              <button
                type="button"
                onClick={() => { pendingFrameType.current = 'last_frame'; frameInputRef.current?.click(); }}
                disabled={uploadingRef}
                title="Картинка, которой видео закончится — модель сделает переход"
                className="h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="ImageDown" size={12} />
                Последний кадр
              </button>
            )}
            {vcaps.supportsReferences && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingRef}
                title={vcaps.supportsVideoInput
                  ? 'Референс стиля или исходное видео для правки'
                  : 'Картинка-референс стиля и содержания'}
                className="h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {uploadingRef ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Paperclip" size={12} />}
                Референс
              </button>
            )}
          </>
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