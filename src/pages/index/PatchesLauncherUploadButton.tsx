import Icon from '@/components/ui/icon';
import type { LauncherUploadInfo } from './patchesUtils';

// Статус заливки файла на VPS лаунчера относительно его текущего hash (см. LAUNCHER_UPLOAD.md):
// не заливался ни разу / залита именно эта версия файла / заливали, но файл с тех пор обновился.
export type LauncherFileStatus = 'none' | 'uploaded' | 'stale';

export function launcherFileStatus(fileHash: string | null | undefined, upload: LauncherUploadInfo | undefined): LauncherFileStatus {
  if (!upload) return 'none';
  if (fileHash && upload.hash === fileHash) return 'uploaded';
  return 'stale';
}

// Маленькая круглая кнопка-бейдж заливки в лаунчер: буква Б (быстрое) или П (полное) внутри
// кружка, цвет меняется по статусу — серый (не заливалось), оранжевый/primary (актуально), жёлтый
// (устарело, файл обновлён после последней заливки).
export default function LauncherUploadButton({ label, title, uploading, status, onClick }: {
  label: string;
  title: string;
  uploading: boolean;
  status: LauncherFileStatus;
  onClick: () => void;
}) {
  const colorClass = status === 'uploaded'
    ? 'text-primary border-primary/40 bg-primary/10 hover:bg-primary/20'
    : status === 'stale'
      ? 'text-amber-500 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
      : 'text-muted-foreground border-border hover:bg-secondary';
  const statusTitle = status === 'uploaded' ? ' — залито' : status === 'stale' ? ' — устарело, требуется перезалить' : '';
  return (
    <button
      onClick={onClick}
      disabled={uploading}
      title={title + statusTitle}
      className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-semibold transition-colors disabled:opacity-40 ${colorClass}`}
    >
      {uploading ? <Icon name="Loader2" size={11} className="animate-spin" /> : label}
    </button>
  );
}