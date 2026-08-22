import { useEffect, useRef, useState } from 'react';
import { IMAGE_COUNT_OPTIONS, imageModelCapabilities, videoModelCapabilities } from './AiTypes';
import { useAutosizeTextarea } from './useAutosizeTextarea';
import { uploadAiAttachment } from './aiUploadApi';
import AiGenerateStatusBar from './AiGenerateStatusBar';
import AiGenerateAttachments from './AiGenerateAttachments';
import AiGenerateParams from './AiGenerateParams';
import AiGeneratePromptInput from './AiGeneratePromptInput';
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

// Композер режимов image/video. Вся логика (состояние параметров, их сохранение в localStorage,
// подгонка под возможности модели, загрузка референсов и отправка) осталась здесь, а разметка
// разнесена по четырём презентационным компонентам: AiGenerateStatusBar (лимит и предупреждения),
// AiGenerateAttachments (превью кадров и референсов), AiGenerateParams (панель параметров),
// AiGeneratePromptInput (поле промпта и кнопка запуска).
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
      <AiGenerateStatusBar
        mode={mode}
        usage={usage}
        limitExceeded={limitExceeded}
        n={n}
        countOptionsLength={countOptions.length}
        refError={refError}
      />

      <AiGenerateAttachments
        frameImages={frameImages}
        referenceImages={referenceImages}
        onRemoveFrame={(id) => setFrameImages((prev) => prev.filter((r) => r.id !== id))}
        onRemoveReference={(id) => setReferenceImages((prev) => prev.filter((r) => r.id !== id))}
      />

      {/* Один скрытый файловый ввод на оба режима: в картинках это референс для правки, в видео —
          референс стиля или исходный ролик. Для видео с video-to-video разрешаем и видеофайлы. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={mode === 'video' && vcaps.supportsVideoInput ? 'image/*,video/*' : 'image/*'}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddReference(f); e.target.value = ''; }}
      />

      <AiGenerateParams
        mode={mode}
        caps={caps}
        vcaps={vcaps}
        countOptions={countOptions}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        n={n}
        setN={setN}
        quality={quality}
        setQuality={setQuality}
        outputFormat={outputFormat}
        setOutputFormat={setOutputFormat}
        transparentBackground={transparentBackground}
        setTransparentBackground={setTransparentBackground}
        duration={duration}
        setDuration={setDuration}
        videoAspect={videoAspect}
        setVideoAspect={setVideoAspect}
        videoResolution={videoResolution}
        setVideoResolution={setVideoResolution}
        videoAudio={videoAudio}
        setVideoAudio={setVideoAudio}
        referenceImagesCount={referenceImages.length}
        uploadingRef={uploadingRef}
        fileInputRef={fileInputRef}
        frameInputRef={frameInputRef}
        pendingFrameType={pendingFrameType}
        onAddFrame={handleAddFrame}
      />

      <AiGeneratePromptInput
        mode={mode}
        prompt={prompt}
        setPrompt={setPrompt}
        onSubmit={handleSubmit}
        generating={generating}
        limitExceeded={limitExceeded}
        expanded={expanded}
        setExpanded={setExpanded}
        maxHeight={maxHeight}
        textareaRef={textareaRef}
        referenceImages={referenceImages}
        frameImages={frameImages}
      />
    </div>
  );
}
