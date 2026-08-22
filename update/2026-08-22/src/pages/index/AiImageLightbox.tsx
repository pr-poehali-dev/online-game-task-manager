import Icon from '@/components/ui/icon';

interface AiImageLightboxProps {
  url: string;
  name: string;
  onClose: () => void;
}

// Полноэкранный просмотр сгенерированного/загруженного изображения — раньше клик по превью в
// ленте сообщений просто открывал файл в новой вкладке браузера (см. AI_MANAGER_PLAN.md).
export default function AiImageLightbox({ url, name, onClose }: AiImageLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <a
          href={url}
          download={name}
          onClick={(e) => e.stopPropagation()}
          title="Скачать"
          className="h-9 w-9 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        >
          <Icon name="Download" size={16} />
        </a>
        <button
          onClick={onClose}
          title="Закрыть"
          className="h-9 w-9 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        >
          <Icon name="X" size={16} />
        </button>
      </div>
      <img
        src={url}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>
  );
}
