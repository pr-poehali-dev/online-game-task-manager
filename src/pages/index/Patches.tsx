import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { PATCHES_URL, authHeaders, servers, formatMskDateTime } from './shared';
import type { ServerId } from './shared';

interface PatchFile {
  id: number;
  path: string;
  size: number;
  url: string;
  updatedAt: string | null;
  taskId: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
  file?: PatchFile;
}

const PART_SIZE = 20 * 1024 * 1024; // 20 МБ на кусок при загрузке

function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function buildTree(files: PatchFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: new Map() };
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

async function postJson(body: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(PATCHES_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
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
}: {
  node: TreeNode;
  depth: number;
  canManage: boolean;
  onDelete: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
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
    return (
      <div
        className="flex items-center gap-2 py-1.5 pr-2 hover:bg-secondary/40 rounded-md transition-colors group"
        style={{ paddingLeft: `${depth * 18 + 24}px` }}
      >
        <Icon name="FileArchive" size={14} className="text-muted-foreground shrink-0" />
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

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 py-1.5 pr-2 hover:bg-secondary/40 rounded-md transition-colors w-full text-left"
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground shrink-0" />
        <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="text-primary shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
        <span className="text-sm font-medium truncate">{node.name || 'root'}</span>
      </button>
      {open && (
        <div>
          {entries.map((child) => (
            <TreeFolder key={child.path} node={child} depth={depth + 1} canManage={canManage} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

type UploadStage = 'idle' | 'uploading' | 'unpacking';

export default function Patches({ canManage, tasks }: { canManage: boolean; tasks: { id: string; title: string }[] }) {
  const [active, setActive] = useState<ServerId>(servers[0].id);
  const [files, setFiles] = useState<PatchFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [taskId, setTaskId] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

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

  const tree = useMemo(() => buildTree(files), [files]);
  const totalSize = useMemo(() => files.reduce((s, f) => s + (f.size || 0), 0), [files]);
  const activeSrv = servers.find((s) => s.id === active) ?? servers[0];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadError('Нужен ZIP-архив');
      return;
    }
    setUploadError('');
    setStage('uploading');
    setProgress(0);
    cancelledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    let stagingKey = '';
    let uploadId = '';
    try {
      const init = await postJson({ action: 'mpu_init', server: active }, controller.signal);
      stagingKey = init.stagingKey;
      uploadId = init.uploadId;

      const totalParts = Math.ceil(file.size / PART_SIZE);
      const parts: { partNumber: number; etag: string }[] = [];
      for (let i = 0; i < totalParts; i++) {
        if (cancelledRef.current) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        const slice = file.slice(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, file.size));
        const b64 = await blobToBase64(slice);
        const res = await postJson({
          action: 'mpu_part',
          stagingKey,
          uploadId,
          partNumber: i + 1,
          data: b64,
        }, controller.signal);
        parts.push({ partNumber: i + 1, etag: res.etag });
        setProgress(Math.round(((i + 1) / totalParts) * 100));
      }

      await postJson({ action: 'mpu_complete', stagingKey, uploadId, parts }, controller.signal);

      setStage('unpacking');
      setProgress(0);
      let offset = 0;
      let totalFiles = 1;
      for (;;) {
        if (cancelledRef.current) break;
        const res = await postJson({
          action: 'zip_ingest_batch',
          server: active,
          stagingKey,
          taskId: taskId || null,
          offset,
        }, controller.signal);
        offset = res.nextOffset;
        totalFiles = res.totalFiles || 1;
        setProgress(Math.min(100, Math.round((offset / Math.max(totalFiles, 1)) * 100)));
        if (res.done) break;
      }
      await load(active);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'cancelled') {
        if (stagingKey && uploadId) {
          postJson({ action: 'mpu_abort', stagingKey, uploadId }).catch(() => {});
        }
        setUploadError('Загрузка отменена');
      } else if (code === 'file_too_large' || code === 'part_too_large') {
        setUploadError('Часть файла оказалась слишком большой — попробуйте другой архив');
      } else if (code === 'bad_zip') {
        setUploadError('Файл повреждён или это не ZIP-архив');
      } else {
        setUploadError('Не удалось загрузить патч — проверьте архив и соединение');
      }
    } finally {
      setStage('idle');
      abortRef.current = null;
    }
  }

  function handleCancelUpload() {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }

  async function handleDelete(path: string) {
    try {
      await postJson({ action: 'delete', server: active, path });
      setFiles((prev) => prev.filter((f) => f.path !== path));
    } catch {
      /* ignore */
    }
  }

  async function handleDownloadAll() {
    setZipping(true);
    setZipProgress(0);
    try {
      const init = await postJson({ action: 'zip_all_init', server: active });
      const { archiveKey, uploadId, totalFiles } = init;
      let fromIndex = 0;
      let cdEntries: unknown[] = [];
      let bytesWritten = 0;
      let partNumber = 1;
      let pendingChunkB64: string | null = null;
      const parts: { partNumber: number; etag: string }[] = [];

      for (;;) {
        const res = await postJson({
          action: 'zip_all_batch',
          server: active,
          archiveKey,
          uploadId,
          fromIndex,
          cdEntries,
          bytesWritten,
          partNumber,
          pendingChunkB64,
        });
        fromIndex = res.nextIndex;
        cdEntries = res.cdEntries;
        bytesWritten = res.bytesWritten;
        partNumber = res.partNumber;
        pendingChunkB64 = res.pendingChunkB64;
        if (res.part) parts.push(res.part);
        setZipProgress(Math.min(99, Math.round((fromIndex / Math.max(totalFiles, 1)) * 100)));
        if (res.done) break;
      }

      const final = await postJson({
        action: 'zip_all_finalize',
        archiveKey,
        uploadId,
        cdEntries,
        bytesWritten,
        partNumber,
        parts,
        pendingChunkB64,
      });
      setZipProgress(100);
      if (final.url) window.open(final.url, '_blank');
    } catch {
      /* ignore */
    } finally {
      setZipping(false);
    }
  }

  const busy = stage !== 'idle';

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="FolderTree" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Патчи</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Дерево файлов клиентского патча по каждому серверу — общее для всех задач. Новая загрузка
        заменяет файл с тем же путём. Поддерживаются архивы в несколько гигабайт — загружаются частями.
      </p>

      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-4 w-fit">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            disabled={busy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 ${
              active === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: active === s.id ? 'currentColor' : `hsl(${s.color})` }} />
            {s.label}
          </button>
        ))}
      </div>

      {canManage && (
        <div className="flex flex-col gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={busy}
              className="h-9 px-2.5 rounded-lg border border-border bg-background text-sm text-muted-foreground max-w-[220px] disabled:opacity-40"
            >
              <option value="">Без привязки к задаче</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            {!busy && (
              <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                <Icon name="Upload" size={14} />
                Загрузить ZIP-патч
                <input type="file" accept=".zip" className="hidden" onChange={handleUpload} />
              </label>
            )}
            {busy && (
              <button
                onClick={handleCancelUpload}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
              >
                <Icon name="X" size={14} />
                Отменить
              </button>
            )}
          </div>
          {busy && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-32 shrink-0">
                {stage === 'uploading' ? `Загрузка… ${progress}%` : `Распаковка… ${progress}%`}
              </span>
            </div>
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 gap-3">
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <Icon name="Server" size={14} className="text-muted-foreground shrink-0" />
            <span className="truncate">{activeSrv.label}</span>
            <span className="text-xs text-muted-foreground font-normal shrink-0">
              · {files.length} файлов{files.length > 0 ? ` · ${fmtSize(totalSize)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {zipping && (
              <span className="text-xs text-muted-foreground">{zipProgress}%</span>
            )}
            <button
              onClick={handleDownloadAll}
              disabled={files.length === 0 || zipping}
              title="Скачать весь патч одним архивом"
              className="h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center gap-1.5"
            >
              <Icon name={zipping ? 'Loader2' : 'FolderArchive'} size={13} className={zipping ? 'animate-spin' : ''} />
              {zipping ? 'Собираю...' : 'Скачать весь патч'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={24} className="animate-spin text-primary" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Icon name="FolderTree" size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Пока нет загруженных файлов для этого сервера</p>
          </div>
        ) : (
          <div className="p-2 max-h-[60vh] overflow-auto scrollbar-thin">
            {Array.from(tree.children.values())
              .sort((a, b) => {
                if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
                return a.name.localeCompare(b.name);
              })
              .map((node) => (
                <TreeFolder key={node.path} node={node} depth={0} canManage={canManage} onDelete={handleDelete} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
