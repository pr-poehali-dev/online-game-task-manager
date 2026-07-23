import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { authHeaders, servers, PATCHES_URL } from './shared';
import type { ServerId } from './shared';
import { fmtSize, buildTree } from './patchesUtils';
import type { PatchFile, DroppedFile } from './patchesUtils';
import { postJson, uploadFileInChunks } from './patchesApi';
import type { UploadQueueItem } from './patchesApi';
import TreeFolder from './PatchesTreeFolder';

export default function Patches({
  canManage,
  tasks,
  initialTaskId,
  initialServerId,
}: {
  canManage: boolean;
  tasks: { id: string; title: string }[];
  initialTaskId?: string | null;
  initialServerId?: ServerId | null;
}) {
  const [active, setActive] = useState<ServerId>(initialServerId ?? servers[0].id);
  const [files, setFiles] = useState<PatchFile[]>([]);
  const [customRoots, setCustomRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [zippingAll, setZippingAll] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[] | null>(null);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [fileProgress, setFileProgress] = useState(0);
  const [togglingPath, setTogglingPath] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const [rootError, setRootError] = useState('');
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const appliedInitial = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const uploading = uploadQueue !== null;

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
        setCustomRoots(data.customRoots || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  useEffect(() => {
    if (initialTaskId && appliedInitial.current !== initialTaskId) {
      setSelectedTaskId(initialTaskId);
      if (initialServerId) setActive(initialServerId);
      appliedInitial.current = initialTaskId;
    }
  }, [initialTaskId, initialServerId]);

  const tree = useMemo(() => buildTree(files, customRoots), [files, customRoots]);
  const customRootNames = useMemo(() => new Set(customRoots), [customRoots]);
  const totalSize = useMemo(() => files.reduce((s, f) => s + (f.size || 0), 0), [files]);
  const activeSrv = servers.find((s) => s.id === active) ?? servers[0];
  const taskFilesCount = useMemo(
    () => (selectedTaskId ? files.filter((f) => f.taskIds.includes(selectedTaskId)).length : 0),
    [files, selectedTaskId]
  );

  const handleDropFiles = useCallback(async (targetFolder: string, dropped: DroppedFile[]) => {
    if (dropped.length === 0) return;
    setUploadError('');
    // targetFolder — полный путь папки, на которую перетащили (корневая или вложенная).
    // Одиночный файл (d.path без вложенных сегментов) кладётся прямо в неё; перетащенная
    // папка (d.path вида "имяПапки/файл") сохраняет свою структуру внутри targetFolder.
    const queue: UploadQueueItem[] = dropped.map((d) => ({
      path: d.path.startsWith(`${targetFolder}/`) ? d.path : `${targetFolder}/${d.path}`,
      file: d.file,
    }));
    setUploadQueue(queue);
    setUploadIndex(0);
    setFileProgress(0);
    cancelledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for (let i = 0; i < queue.length; i++) {
        if (cancelledRef.current) break;
        setUploadIndex(i);
        setFileProgress(0);
        await uploadFileInChunks(active, queue[i].path, queue[i].file, selectedTaskId, controller.signal, setFileProgress);
      }
      await load(active);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'cancelled' || (err as Error)?.name === 'AbortError') {
        setUploadError('Загрузка отменена');
      } else if (code === 'file_too_large') {
        setUploadError('Файл слишком большой (максимум 200 МБ)');
      } else {
        setUploadError('Не удалось загрузить файлы — проверьте соединение и попробуйте ещё раз');
      }
      await load(active);
    } finally {
      setUploadQueue(null);
      abortRef.current = null;
    }
  }, [active, selectedTaskId, load]);

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

  async function handleToggleTask(path: string) {
    if (!selectedTaskId) return;
    setTogglingPath(path);
    try {
      const data = await postJson({ action: 'toggle_task', server: active, path, taskId: selectedTaskId });
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, taskIds: data.taskIds } : f)));
    } catch {
      /* ignore */
    } finally {
      setTogglingPath(null);
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

  async function handleDownloadAllZip() {
    if (files.length === 0) return;
    setZippingAll(true);
    try {
      const data = await postJson({ action: 'zip_all', server: active });
      if (data.url) window.open(data.url, '_blank');
    } catch {
      /* ignore */
    } finally {
      setZippingAll(false);
    }
  }

  async function handleAddRoot() {
    const name = newRootName.trim();
    if (!name) return;
    setRootError('');
    try {
      await postJson({ action: 'add_root', server: active, name });
      setNewRootName('');
      setAddingRoot(false);
      await load(active);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'bad_request') setRootError('Недопустимое имя папки — только буквы, цифры, «_» и «-»');
      else setRootError('Не удалось создать папку');
    }
  }

  async function handleDeleteRoot(name: string) {
    setDeletingRoot(name);
    try {
      await postJson({ action: 'delete_root', server: active, name });
      setCustomRoots((prev) => prev.filter((r) => r !== name));
    } catch {
      /* ignore */
    } finally {
      setDeletingRoot(null);
    }
  }

  return (
    <div className="max-w-6xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="FolderTree" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Патчи</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Дерево файлов клиентского патча по каждому серверу — общее для всех задач. Перетащите папку
        или отдельный файл прямо на нужную папку в дереве ниже (любого уровня вложенности) —
        структура внутри перетащенной папки сохранится.
      </p>

      <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
        >
          <Icon name="ChevronRight" size={16} className={`text-muted-foreground shrink-0 transition-transform ${showHelp ? 'rotate-90' : ''}`} />
          <Icon name="Info" size={15} className="text-primary shrink-0" />
          <span className="text-sm font-medium flex-1">Как работать с патчами</span>
        </button>
        {showHelp && (
          <div className="px-4 pb-4 pt-1 border-t border-border/60 text-sm text-muted-foreground space-y-3">
            <div>
              <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
                <Icon name="Upload" size={13} /> Как залить патч для задачи
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Вверху выберите нужный сервер (C4x1, HFx3 old, HF new) — у каждого своё дерево файлов.</li>
                <li>В выпадающем списке «Без выбранной задачи» выберите задачу, к которой относится патч.</li>
                <li>Перетащите файл или целую папку прямо на нужную папку в дереве ниже — можно как на корневую (например «System» или «data»), так и на любую вложенную папку внутри неё. Структура вложенных папок сохранится автоматически, а все загруженные файлы сразу привяжутся к выбранной задаче.</li>
              </ol>
              <p className="mt-1.5">
                Загружать и удалять файлы могут только администраторы и участники с правом полного
                редактирования задач.
              </p>
            </div>
            <div>
              <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
                <Icon name="Paperclip" size={13} /> Привязка уже загруженных файлов к задаче
              </p>
              <p>
                Если файл уже был загружен без выбранной задачи (или относится ещё к одной): выберите
                задачу в списке сверху, наведите курсор на нужный файл в дереве и нажмите появившуюся
                иконку скрепки — она прикрепит или открепит файл от выбранной задачи. Один файл может
                относиться сразу к нескольким задачам.
              </p>
            </div>
            <div>
              <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
                <Icon name="Download" size={13} /> Скачивание
              </p>
              <p>
                Отдельный файл скачивается иконкой скачивания рядом с ним. Если выбрана задача —
                кнопка «Скачать файлы задачи» соберёт архив (zip) сразу из всех файлов, привязанных
                к этой задаче. Кнопка «Скачать всё» рядом с названием сервера собирает архив
                вообще из всего дерева файлов этого сервера.
              </p>
            </div>
            <div>
              <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
                <Icon name="FolderPlus" size={13} /> Свои папки
              </p>
              <p>
                Кроме стандартных корневых папок (animations, data, l2text, maps, staticmeshes,
                System, System_eng, systextures, textures) можно создать свою — кнопкой «+» справа
                от названия сервера. Удалить пользовательскую папку можно только когда она пустая.
              </p>
            </div>
          </div>
        )}
      </div>

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
          <div className="flex items-center gap-1.5 shrink-0">
            {files.length > 0 && (
              <button
                onClick={handleDownloadAllZip}
                disabled={zippingAll}
                title="Скачать всё дерево файлов сервера архивом"
                className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
              >
                <Icon name={zippingAll ? 'Loader2' : 'FolderDown'} size={14} className={zippingAll ? 'animate-spin' : ''} />
                {zippingAll ? 'Собираю...' : 'Скачать всё'}
              </button>
            )}
            {canManage && !addingRoot && (
              <button
                onClick={() => { setAddingRoot(true); setRootError(''); }}
                title="Добавить папку"
                className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Icon name="Plus" size={15} />
              </button>
            )}
          </div>
        </div>

        {canManage && addingRoot && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/20">
            <input
              autoFocus
              value={newRootName}
              onChange={(e) => setNewRootName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddRoot(); if (e.key === 'Escape') { setAddingRoot(false); setNewRootName(''); setRootError(''); } }}
              placeholder="Название папки (латиница, цифры, _ и -)"
              className="h-8 flex-1 min-w-0 px-2.5 rounded-lg border border-border bg-background text-sm"
            />
            <button
              onClick={handleAddRoot}
              disabled={!newRootName.trim()}
              className="h-8 px-3 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              Создать
            </button>
            <button
              onClick={() => { setAddingRoot(false); setNewRootName(''); setRootError(''); }}
              className="h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition-colors"
            >
              Отмена
            </button>
            {rootError && <p className="text-xs text-destructive w-full">{rootError}</p>}
          </div>
        )}

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
                  onToggleTask={handleToggleTask}
                  togglingPath={togglingPath}
                  customRootNames={customRootNames}
                  onDeleteRoot={handleDeleteRoot}
                  deletingRoot={deletingRoot}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}