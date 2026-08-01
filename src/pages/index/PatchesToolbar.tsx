import Icon from '@/components/ui/icon';
import type { ServerItem } from '@/lib/catalog';
import type { ServerId } from './shared';
import type { UploadQueueItem } from './patchesApi';

export default function PatchesToolbar({
  servers, active, setActive,
  tasksForServer, selectedTaskId, setSelectedTaskId,
  handleDownloadTaskZip, taskFilesCount, zipping,
  canManage, uploading, uploadQueue, uploadIndex, fileProgress, handleCancelUpload,
  uploadError, launcherError,
}: {
  servers: ServerItem[];
  active: ServerId;
  setActive: (id: ServerId) => void;
  tasksForServer: { id: string; title: string; server: ServerId }[];
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  handleDownloadTaskZip: () => void;
  taskFilesCount: number;
  zipping: boolean;
  canManage: boolean;
  uploading: boolean;
  uploadQueue: UploadQueueItem[] | null;
  uploadIndex: number;
  fileProgress: number;
  handleCancelUpload: () => void;
  uploadError: string;
  launcherError: string;
}) {
  return (
    <>
      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-4 w-fit">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: active === s.id ? 'currentColor' : `hsl(${s.color})` }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
        <select
          value={selectedTaskId}
          onChange={(e) => setSelectedTaskId(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-border bg-background text-sm text-muted-foreground max-w-[260px]"
        >
          <option value="">Без выбранной задачи</option>
          {tasksForServer.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        {selectedTaskId && (
          <button
            onClick={handleDownloadTaskZip}
            disabled={taskFilesCount === 0 || zipping}
            className="h-9 px-3 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center gap-1.5"
          >
            <Icon name={zipping ? 'Loader2' : 'Download'} size={14} className={zipping ? 'animate-spin' : ''} />
            {zipping ? 'Собираю...' : `Скачать файлы задачи (${taskFilesCount})`}
          </button>
        )}
        {canManage && uploading && uploadQueue && (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${Math.round(((uploadIndex + fileProgress) / uploadQueue.length) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              Файл {uploadIndex + 1}/{uploadQueue.length} · {Math.round(fileProgress * 100)}%
            </span>
            <button
              onClick={handleCancelUpload}
              className="h-7 px-2.5 rounded-md border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 transition-colors shrink-0"
            >
              Отменить
            </button>
          </div>
        )}
        {uploadError && <p className="text-xs text-destructive w-full">{uploadError}</p>}
        {launcherError && <p className="text-xs text-destructive w-full">{launcherError}</p>}
      </div>
    </>
  );
}