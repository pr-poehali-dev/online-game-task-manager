import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { fmtFileSize } from '../admin/adminShared';
import type { AiProjectFile, AiProjectsState } from './useAiProjects';

// Состояние разбора файла для поиска. unsupported — не ошибка: в картинке или видео просто нет
// текста, файл остаётся в проекте, но в поиске не участвует.
const INDEX_LABELS: Record<string, { icon: string; text: string; className: string }> = {
  pending: { icon: 'Clock', text: 'В очереди', className: 'text-muted-foreground' },
  indexing: { icon: 'Loader2', text: 'Обрабатывается', className: 'text-primary' },
  ready: { icon: 'Check', text: 'Готов к поиску', className: 'text-muted-foreground' },
  unsupported: { icon: 'Minus', text: 'Без текста', className: 'text-muted-foreground' },
  failed: { icon: 'AlertCircle', text: 'Не удалось прочитать', className: 'text-destructive' },
};

function fileIcon(file: AiProjectFile): string {
  if (file.contentType.startsWith('image/')) return 'Image';
  if (file.contentType.startsWith('video/')) return 'Video';
  if (file.contentType === 'application/pdf') return 'FileText';
  return 'File';
}

// Раскладывает плоский список файлов по папкам, взятым из relPath (src/pages/Ai.tsx → «src/pages»).
// Файлы, загруженные по одному, попадают в общую группу без папки.
function groupByFolder(files: AiProjectFile[]) {
  const map = new Map<string, AiProjectFile[]>();
  for (const file of files) {
    const rel = file.relPath || '';
    const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const list = map.get(folder) || [];
    list.push(file);
    map.set(folder, list);
  }
  // Папки по алфавиту, файлы без папки — всегда первыми.
  return [...map.entries()]
    .sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])))
    .map(([folder, items]) => ({ folder, items }));
}

// AiProjectFiles — вкладка «Файлы» проекта: загрузка отдельных файлов И ПАПОК ЦЕЛИКОМ (с
// сохранением структуры), дерево по папкам, статус разбора и удаление из проекта.
export default function AiProjectFiles({
  state,
  onUploadFiles,
  uploading,
  uploadProgress,
  uploadQueue,
}: {
  state: AiProjectsState;
  onUploadFiles: (files: File[]) => void;
  uploading: boolean;
  uploadProgress: number | null;
  uploadQueue: { done: number; total: number; name: string } | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  // Поле выбора ПАПКИ держим в состоянии, а не в ref: нестандартные атрибуты webkitdirectory/
  // directory приходится проставлять вручную в ref-колбэке.
  const [folderInput, setFolderInput] = useState<HTMLInputElement | null>(null);

  const groups = useMemo(() => groupByFolder(state.projectFiles), [state.projectFiles]);

  // Перетащенную ПАПКУ браузер отдаёт как запись каталога — обходим её рекурсивно, иначе при
  // перетаскивании папки не загрузилось бы ничего.
  async function readEntry(entry: FileSystemEntry, path: string, out: File[]): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file((f) => resolve(f), () => resolve(null));
      });
      if (file) {
        Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name, writable: false });
        out.push(file);
      }
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries отдаёт записи порциями — читаем, пока не вернётся пустая порция.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries((entries) => resolve(entries), () => resolve([]));
        });
        if (!batch.length) break;
        for (const child of batch) await readEntry(child, `${path}${entry.name}/`, out);
      }
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const items = Array.from(e.dataTransfer.items || []);
    const entries = items
      .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
      .filter(Boolean) as FileSystemEntry[];
    if (entries.length) {
      const collected: File[] = [];
      for (const entry of entries) await readEntry(entry, '', collected);
      if (collected.length) onUploadFiles(collected);
      return;
    }
    onUploadFiles(Array.from(e.dataTransfer.files || []));
  }

  function toggleFolder(folder: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl border border-dashed transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onUploadFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        {/* webkitdirectory — выбор ПАПКИ целиком. Атрибут нестандартный, поэтому задаётся через
            ref-свойства ниже (в JSX-типах React его нет). */}
        <input
          ref={(el) => {
            if (el) {
              el.setAttribute('webkitdirectory', '');
              el.setAttribute('directory', '');
            }
            setFolderInput(el);
          }}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onUploadFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />

        {uploading ? (
          <>
            <Icon name="Loader2" size={18} className="animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {uploadQueue && uploadQueue.total > 1
                ? `Загружено ${uploadQueue.done} из ${uploadQueue.total}`
                : `Загрузка${uploadProgress != null ? `: ${Math.round(uploadProgress * 100)}%` : '…'}`}
            </span>
            {uploadQueue?.name && (
              <span className="max-w-[280px] truncate text-[11px] text-muted-foreground/70">
                {uploadQueue.name}
              </span>
            )}
            {uploadQueue && uploadQueue.total > 1 && (
              <div className="w-48 h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(uploadQueue.done / uploadQueue.total) * 100}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <Icon name="Upload" size={18} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Перетащите сюда файлы или целую папку
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => fileInput.current?.click()}
                className="h-7 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
              >
                <Icon name="File" size={12} />
                Выбрать файлы
              </button>
              <button
                onClick={() => folderInput?.click()}
                className="h-7 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
              >
                <Icon name="FolderUp" size={12} />
                Выбрать папку
              </button>
            </div>
          </>
        )}
      </div>

      {state.projectFiles.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          В проекте пока нет файлов
        </div>
      ) : (
        <div className="space-y-1">
          {groups.map(({ folder, items }) => {
            const open = folder === '' || openFolders.has(folder);
            const folderSize = items.reduce((sum, f) => sum + f.size, 0);
            return (
              <div key={folder || '__root__'}>
                {folder !== '' && (
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-secondary/50 transition-colors"
                  >
                    <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} className="shrink-0 text-muted-foreground" />
                    <Icon name="Folder" size={13} className="shrink-0 text-primary" />
                    <span className="truncate">{folder}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
                      {items.length} · {fmtFileSize(folderSize)}
                    </span>
                  </button>
                )}

                {open && (
                  <div className={folder === '' ? 'space-y-0.5' : 'pl-4 ml-2 border-l border-border/60 space-y-0.5'}>
                    {items.map((file) => {
                      const indexState = INDEX_LABELS[file.indexStatus] || INDEX_LABELS.pending;
                      return (
                        <div
                          key={file.id}
                          className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors"
                        >
                          <Icon name={fileIcon(file)} size={14} className="shrink-0 text-muted-foreground" />
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={file.relPath || file.name}
                            className="flex-1 min-w-0 truncate text-sm hover:text-primary transition-colors"
                          >
                            {file.name}
                          </a>
                          <span
                            className={`shrink-0 hidden sm:flex items-center gap-1 text-[10px] ${indexState.className}`}
                            title={indexState.text}
                          >
                            <Icon
                              name={indexState.icon}
                              size={10}
                              className={file.indexStatus === 'indexing' ? 'animate-spin' : ''}
                            />
                            {indexState.text}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{fmtFileSize(file.size)}</span>
                          <button
                            onClick={() => state.attachFiles([file.id], null)}
                            title="Убрать из проекта (файл останется в «Моих файлах»)"
                            className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                          >
                            <Icon name="X" size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
