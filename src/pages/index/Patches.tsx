import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { PATCHES_URL, authHeaders, servers, formatMskDateTime } from './shared';
import type { ServerId } from './shared';

export const PATCH_ROOTS = [
  'animations', 'data', 'l2text', 'maps', 'staticmeshes',
  'System', 'System_eng', 'systextures', 'textures',
];

interface PatchFile {
  id: number;
  path: string;
  size: number;
  url: string;
  updatedAt: string | null;
  taskIds: string[];
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
  file?: PatchFile;
}

function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function buildTree(files: PatchFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: new Map() };
  for (const rootName of PATCH_ROOTS) {
    root.children.set(rootName, { name: rootName, path: rootName, isFile: false, children: new Map() });
  }
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, isFile: isLast, children: new Map() };
        node.children.set(part, child);
      }
      if (isLast) child.file = f;
      node = child;
    }
  }
  return root;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

interface DroppedFile {
  path: string;
  file: File;
}

function readEntry(entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        out.push({ path: `${prefix}${entry.name}`, file });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const entries: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            await Promise.all(entries.map((e) => readEntry(e, `${prefix}${entry.name}/`, out)));
            resolve();
            return;
          }
          entries.push(...batch);
          readBatch();
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length > 0) {
    await Promise.all(entries.map((e) => readEntry(e, '', out)));
    return out;
  }
  // Фолбэк для браузеров без Entries API — берём файлы плоско
  Array.from(dataTransfer.files || []).forEach((file) => {
    out.push({ path: file.name, file });
  });
  return out;
}

async function postJson(body: Record<string, unknown>) {
  const res = await fetch(PATCHES_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { code: data.error });
  return data;
}

function TreeFolder({
  node,
  depth,
  canManage,
  onDelete,
  highlightTaskId,
  onDropFiles,
  dragActive,
  setDragActive,
}: {
  node: TreeNode;
  depth: number;
  canManage: boolean;
  onDelete: (path: string) => void;
  highlightTaskId: string | null;
  onDropFiles: (rootFolder: string, files: DroppedFile[]) => void;
  dragActive: string | null;
  setDragActive: (path: string | null) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const isRoot = depth === 0;
  const entries = useMemo(() => {
    const arr = Array.from(node.children.values());
    arr.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [node]);

  if (node.isFile && node.file) {
    const f = node.file;
    const highlighted = !!highlightTaskId && f.taskIds.includes(highlightTaskId);
    return (
      <div
        className={`flex items-center gap-2 py-1.5 pr-2 rounded-md transition-colors group ${
          highlighted ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/40'
        }`}
        style={{ paddingLeft: `${depth * 18 + 24}px` }}
      >
        <Icon name="File" size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{fmtSize(f.size)}</span>
        <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">{formatMskDateTime(f.updatedAt)}</span>
        <a
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Скачать файл"
          className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="Download" size={13} />
        </a>
        {canManage && (confirmPath === f.path ? (
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={() => { setConfirmPath(null); onDelete(f.path); }}
              className="h-6 px-2 rounded-md bg-destructive/90 text-white text-[11px] hover:bg-destructive transition-colors"
            >
              Да
            </button>
            <button
              onClick={() => setConfirmPath(null)}
              className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Нет
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmPath(f.path)}
            title="Удалить файл"
            className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Icon name="Trash2" size={13} />
          </button>
        ))}
      </div>
    );
  }

  const rootName = node.path.split('/')[0];
  const isDragTarget = dragActive === node.path;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        onDragOver={canManage && isRoot ? (e) => { e.preventDefault(); setDragActive(node.path); } : undefined}
        onDragLeave={canManage && isRoot ? () => setDragActive(null) : undefined}
        onDrop={canManage && isRoot ? (e) => {
          e.preventDefault();
          setDragActive(null);
          collectDroppedFiles(e.dataTransfer).then((files) => onDropFiles(rootName, files));
        } : undefined}
        className={`flex items-center gap-2 py-1.5 pr-2 rounded-md transition-colors w-full text-left ${
          isDragTarget ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-secondary/40'
        }`}
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground shrink-0" />
        <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
        <span className="text-sm font-medium truncate">{node.name}</span>
        {isRoot && canManage && (
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100">перетащите папку сюда</span>
        )}
      </button>
      {open && (
        <div>
          {entries.length === 0 && (
            <div className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${(depth + 1) * 18 + 24}px` }}>
              пусто
            </div>
          )}
          {entries.map((child) => (
            <TreeFolder
              key={child.path}
              node={child}
              depth={depth + 1}
              canManage={canManage}
              onDelete={onDelete}
              highlightTaskId={highlightTaskId}
              onDropFiles={onDropFiles}
              dragActive={dragActive}
              setDragActive={setDragActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Patches({
  canManage,
  tasks,
  initialTaskId,
}: {
  canManage: boolean;
  tasks: { id: string; title: string }[];
  initialTaskId?: string | null;
}) {
  const [active, setActive] = useState<ServerId>(servers[0].id);
  const [files, setFiles] = useState<PatchFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [dragActive, setDragActive] = useState<string | null>(null);
  const appliedInitial = useRef(false);

  const load = useCallback(async (server: ServerId) => {
    setLoading(true);
    try {
      const res = await fetch(`${PATCHES_URL}?action=tree&server=${encodeURIComponent(server)}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  useEffect(() => {
    if (initialTaskId && !appliedInitial.current) {
      setSelectedTaskId(initialTaskId);
      appliedInitial.current = true;
    }
  }, [initialTaskId]);

  const tree = useMemo(() => buildTree(files), [files]);
  const totalSize = useMemo(() => files.reduce((s, f) => s + (f.size || 0), 0), [files]);
  const activeSrv = servers.find((s) => s.id === active) ?? servers[0];
  const taskFilesCount = useMemo(
    () => (selectedTaskId ? files.filter((f) => f.taskIds.includes(selectedTaskId)).length : 0),
    [files, selectedTaskId]
  );

  const handleDropFiles = useCallback(async (rootFolder: string, dropped: DroppedFile[]) => {
    if (dropped.length === 0) return;
    setUploadError('');
    setUploading(true);
    try {
      const filesPayload: { path: string; data: string }[] = [];
      for (const d of dropped) {
        const rel = d.path.startsWith(`${rootFolder}/`) ? d.path : `${rootFolder}/${d.path}`;
        const b64 = await blobToBase64(d.file);
        filesPayload.push({ path: rel, data: b64 });
      }
      await postJson({
        action: 'upload_batch',
        server: active,
        taskId: selectedTaskId || null,
        files: filesPayload,
      });
      await load(active);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'file_too_large') setUploadError('Суммарный размер загружаемых файлов превышает 300 МБ');
      else setUploadError('Не удалось загрузить файлы — проверьте соединение и попробуйте ещё раз');
    } finally {
      setUploading(false);
    }
  }, [active, selectedTaskId, load]);

  async function handleDelete(path: string) {
    try {
      await postJson({ action: 'delete', server: active, path });
      setFiles((prev) => prev.filter((f) => f.path !== path));
    } catch {
      /* ignore */
    }
  }

  async function handleDownloadTaskZip() {
    if (!selectedTaskId) return;
    setZipping(true);
    try {
      const data = await postJson({ action: 'task_zip', server: active, taskId: selectedTaskId });
      if (data.url) window.open(data.url, '_blank');
    } catch {
      /* ignore */
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="FolderTree" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Патчи</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Дерево файлов клиентского патча по каждому серверу — общее для всех задач. Перетащите папку
        (например «System» или «data») прямо на нужную корневую папку ниже — структура внутри сохранится.
      </p>

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
          {tasks.map((t) => (
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
        {canManage && uploading && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Icon name="Loader2" size={13} className="animate-spin" />
            Загрузка файлов...
          </span>
        )}
        {uploadError && <p className="text-xs text-destructive w-full">{uploadError}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 gap-3">
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <Icon name="Server" size={14} className="text-muted-foreground shrink-0" />
            <span className="truncate">{activeSrv.label}</span>
            <span className="text-xs text-muted-foreground font-normal shrink-0">
              · {files.length} файлов{files.length > 0 ? ` · ${fmtSize(totalSize)}` : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="p-2 max-h-[60vh] overflow-auto scrollbar-thin">
            {Array.from(tree.children.values()).map((node) => (
              <div key={node.path} className="group">
                <TreeFolder
                  node={node}
                  depth={0}
                  canManage={canManage}
                  onDelete={handleDelete}
                  highlightTaskId={selectedTaskId || null}
                  onDropFiles={handleDropFiles}
                  dragActive={dragActive}
                  setDragActive={setDragActive}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
