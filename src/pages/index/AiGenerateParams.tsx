import type { MutableRefObject, RefObject } from 'react';
import Icon from '@/components/ui/icon';
import type { ImageModelCapabilities, VideoModelCapabilities } from './AiTypes';

interface AiGenerateParamsProps {
  mode: 'image' | 'video';
  caps: ImageModelCapabilities;
  vcaps: VideoModelCapabilities;
  countOptions: number[];
  // Значения параметров изображений
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  n: number;
  setN: (value: number) => void;
  quality: string;
  setQuality: (value: string) => void;
  outputFormat: string;
  setOutputFormat: (value: string) => void;
  transparentBackground: boolean;
  setTransparentBackground: (updater: (v: boolean) => boolean) => void;
  // Значения параметров видео
  duration: number;
  setDuration: (value: number) => void;
  videoAspect: string;
  setVideoAspect: (value: string) => void;
  videoResolution: string;
  setVideoResolution: (value: string) => void;
  videoAudio: boolean;
  setVideoAudio: (updater: (v: boolean) => boolean) => void;
  // Вложения и загрузка
  referenceImagesCount: number;
  uploadingRef: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  frameInputRef: RefObject<HTMLInputElement>;
  // Mutable-ref: в него записывается тип кадра перед открытием файлового диалога (см. handleAddFrame).
  pendingFrameType: MutableRefObject<string>;
  onAddFrame: (file: File) => void;
}

// Панель параметров генерации: набор селектов и кнопок, зависящий от режима и возможностей
// выбранной модели. Разметка и все условия показа перенесены из AiGenerateComposer без изменений.
export default function AiGenerateParams({
  mode, caps, vcaps, countOptions,
  aspectRatio, setAspectRatio, n, setN, quality, setQuality,
  outputFormat, setOutputFormat, transparentBackground, setTransparentBackground,
  duration, setDuration, videoAspect, setVideoAspect,
  videoResolution, setVideoResolution, videoAudio, setVideoAudio,
  referenceImagesCount, uploadingRef, fileInputRef, frameInputRef, pendingFrameType, onAddFrame,
}: AiGenerateParamsProps) {
  return (
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
                disabled={referenceImagesCount > 0}
                title={referenceImagesCount > 0 ? 'При редактировании по референсу сохраняются пропорции исходного фото' : 'Соотношение сторон'}
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
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddFrame(f); e.target.value = ''; }}
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
  );
}