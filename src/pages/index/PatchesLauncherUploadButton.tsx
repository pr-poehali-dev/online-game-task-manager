import Icon from '@/components/ui/icon';
import type { LauncherUploadInfo } from './patchesUtils';

// Статус заливки файла на VPS лаунчера относительно его текущего hash (см. LAUNCHER_UPLOAD.md):
// не заливался ни разу (или заливали, но hash с тех пор разошёлся с текущим — считаем как
// "не залит", а не отдельным промежуточным статусом: и заливка (verify_ok), и сверка
// (action=launcher_sync) сами удаляют запись в patch_launcher_uploads при несовпадении hash,
// поэтому на фронте лишний третий статус только дублировал бы одно и то же состояние) / залита
// именно эта версия файла.
export type LauncherFileStatus = 'none' | 'uploaded';

export function launcherFileStatus(fileHash: string | null | undefined, upload: LauncherUploadInfo | undefined): LauncherFileStatus {
  if (!upload) return 'none';
  if (fileHash && upload.hash === fileHash) return 'uploaded';
  return 'none';
}

// Маленькая круглая кнопка-бейдж заливки в лаунчер: буква Б (быстрое) или П (полное) внутри
// кружка, цвет меняется по статусу — серый (не заливалось), оранжевый/primary (залито).
export default function LauncherUploadButton({ label, title, uploading, status, onClick }: {
  label: string;
  title: string;
  uploading: boolean;
  status: LauncherFileStatus;
  onClick: () => void;
}) {
  const colorClass = status === 'uploaded'
    ? 'text-primary border-primary/40 bg-primary/10 hover:bg-primary/20'
    : 'text-muted-foreground border-border hover:bg-secondary';
  const statusTitle = status === 'uploaded' ? ' — залито' : '';
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
