import Icon from '@/components/ui/icon';
import type { AiAttachment } from './AiTypes';

interface AiGenerateAttachmentsProps {
  frameImages: (AiAttachment & { frameType: string })[];
  referenceImages: AiAttachment[];
  onRemoveFrame: (id: string) => void;
  onRemoveReference: (id: string) => void;
}

// Превью прикреплённых опорных кадров и референсов над панелью параметров. Разметка перенесена
// из AiGenerateComposer один в один; изменилась только форма обработчиков удаления — вместо
// прямых setState приходят колбэки, работающие с тем же самым состоянием в родителе.
export default function AiGenerateAttachments({
  frameImages, referenceImages, onRemoveFrame, onRemoveReference,
}: AiGenerateAttachmentsProps) {
  if (referenceImages.length === 0 && frameImages.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {/* Опорные кадры подписаны, чтобы было видно, какой из них первый, а какой последний. */}
      {frameImages.map((a) => (
        <div key={a.id} className="relative group">
          <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover border border-primary/50" />
          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] text-center rounded-b-lg py-0.5">
            {a.frameType === 'last_frame' ? 'финал' : 'старт'}
          </span>
          <button
            onClick={() => onRemoveFrame(a.id)}
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
            onClick={() => onRemoveReference(a.id)}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icon name="X" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
