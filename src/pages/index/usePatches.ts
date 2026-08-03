import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCatalog } from '@/lib/catalog';
import { authHeaders, PATCHES_URL } from './shared';
import type { ServerId } from './shared';
import { buildTree } from './patchesUtils';
import type { PatchFile, DroppedFile, LauncherUploadsMap } from './patchesUtils';
import { postJson, uploadFileInChunks } from './patchesApi';
import type { UploadQueueItem } from './patchesApi';
import { useDdfFileDescriptions } from './useDdfFileDescriptions';

export function usePatches({
  tasks,
  initialTaskId,
  initialServerId,
  onFileTaskLinkChange,
}: {
  tasks: { id: string; title: string; server: ServerId }[];
  initialTaskId?: string | null;
  initialServerId?: ServerId | null;
  onFileTaskLinkChange?: () => void;
}) {
  const { servers } = useCatalog();
  // active изначально пустая строка, если серверы (из useCatalog) ещё не подгрузились к моменту
  // первого рендера — как только список придёт, useEffect ниже выставит первый сервер (или
  // initialServerId, если он был передан по постоянной ссылке из "Патчи" на карточке задачи).
  const [active, setActive] = useState<ServerId>(initialServerId ?? '');
  useEffect(() => {
    if (!active && servers.length > 0) setActive(initialServerId ?? servers[0].id);
  }, [servers, active, initialServerId]);
  const [files, setFiles] = useState<PatchFile[]>([]);
  const [customRoots, setCustomRoots] = useState<string[]>([]);
  const [launcherUploads, setLauncherUploads] = useState<LauncherUploadsMap>({});
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
  const [launcherUploadingKey, setLauncherUploadingKey] = useState<string | null>(null);
  const [launcherError, setLauncherError] = useState('');
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const [rootError, setRootError] = useState('');
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null);
  const [editingDdfPath, setEditingDdfPath] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const appliedInitial = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const uploading = uploadQueue !== null;
  const {
    customFiles, customFolders, isOwner, savingKey: savingDescKey,
    saveError: descError, saveDescription, deleteDescription,
  } = useDdfFileDescriptions();

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
        setLauncherUploads(data.launcherUploads || {});
      } else {
        // Запрос за деревом файлов не удался (например сервер не найден) — обязательно очищаем
        // список, иначе на экране остаётся дерево ПРЕДЫДУЩЕГО открытого сервера и выглядит так,
        // будто это файлы нового/только что выбранного сервера.
        setFiles([]);
        setCustomRoots([]);
        setLauncherUploads({});
      }
    } catch {
      setFiles([]);
      setCustomRoots([]);
      setLauncherUploads({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (active) load(active); }, [active, load]);

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
  const activeSrv = servers.find((s) => s.id === active) ?? servers[0] ?? { id: active, label: 'Сервер', color: '215 15% 55%' };
  const tasksForServer = useMemo(() => tasks.filter((t) => t.server === active), [tasks, active]);

  // При смене сервера сбрасываем выбранную задачу, если она относится к другому серверу
  useEffect(() => {
    if (selectedTaskId && !tasksForServer.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId('');
    }
  }, [active, tasksForServer, selectedTaskId]);

  // При смене сервера сбрасываем режим выбора файлов — набор путей относится только к текущему дереву
  useEffect(() => {
    setSelectMode(false);
    setSelectedPaths(new Set());
    setBulkDeleteError('');
  }, [active]);

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
      if (selectedTaskId) onFileTaskLinkChange?.();
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
      setSelectedPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      onFileTaskLinkChange?.();
    } catch {
      /* ignore */
    }
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedPaths(new Set());
    setBulkDeleteError('');
  }

  function toggleSelectPath(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // Удаляет разом все отмеченные чекбоксами файлы — см. action='delete_bulk' в backend/patches.
  async function handleBulkDelete() {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;
    setBulkDeleting(true);
    setBulkDeleteError('');
    try {
      const data = await postJson({ action: 'delete_bulk', server: active, paths });
      const deleted = new Set<string>(data.deletedPaths || paths);
      setFiles((prev) => prev.filter((f) => !deleted.has(f.path)));
      setSelectedPaths(new Set());
      setSelectMode(false);
      onFileTaskLinkChange?.();
    } catch {
      setBulkDeleteError('Не удалось удалить выбранные файлы — попробуйте ещё раз');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleToggleTask(path: string) {
    if (!selectedTaskId) return;
    setTogglingPath(path);
    try {
      const data = await postJson({ action: 'toggle_task', server: active, path, taskId: selectedTaskId });
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, taskIds: data.taskIds } : f)));
      onFileTaskLinkChange?.();
    } catch {
      /* ignore */
    } finally {
      setTogglingPath(null);
    }
  }

  // Заливает файл на VPS игрового лаунчера (быстрое или полное обновление) — см.
  // LAUNCHER_UPLOAD.md. Backend упаковывает файл в .zip и правит XML-реестр на сервере.
  async function handleLauncherUpload(path: string, target: 'fast' | 'full') {
    const key = `${path}:${target}`;
    setLauncherUploadingKey(key);
    setLauncherError('');
    try {
      const data = await postJson({ action: 'launcher_upload', server: active, path, target });
      setLauncherUploads((prev) => ({
        ...prev,
        [path]: { ...prev[path], [target]: { hash: data.hash, uploadedAt: new Date().toISOString() } },
      }));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'launcher_paths_not_configured') {
        setLauncherError('Для этого сервера не заданы пути лаунчера — заполните их в «Управление проектом → Серверы»');
      } else if (code === 'ssh_not_configured') {
        setLauncherError('SSH-доступ к серверу лаунчера не настроен — заполните его в «Управление проектом → Служебные ключи»');
      } else if (code === 'file_hash_missing') {
        setLauncherError('У файла ещё нет контрольной суммы — перезалейте его в патчи и попробуйте снова');
      } else if (code === 'xml_verify_failed') {
        setLauncherError('Файл отправлен, но не удалось подтвердить запись в XML-реестре на хостинге — попробуйте залить ещё раз');
      } else {
        setLauncherError('Не удалось залить файл на сервер лаунчера — проверьте подключение и попробуйте ещё раз');
      }
    } finally {
      setLauncherUploadingKey(null);
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

  return {
    servers, active, setActive,
    files, launcherUploads,
    loading, uploadError, zipping, zippingAll,
    selectedTaskId, setSelectedTaskId,
    dragActive, setDragActive,
    uploadQueue, uploadIndex, fileProgress,
    togglingPath, launcherUploadingKey, launcherError,
    addingRoot, setAddingRoot, newRootName, setNewRootName, rootError, setRootError,
    deletingRoot, editingDdfPath, setEditingDdfPath,
    uploading,
    customFiles, customFolders, isOwner, savingDescKey, descError, saveDescription, deleteDescription,
    tree, customRootNames, totalSize, activeSrv, tasksForServer, taskFilesCount,
    handleDropFiles, handleCancelUpload, handleDelete, handleToggleTask, handleLauncherUpload,
    handleDownloadTaskZip, handleDownloadAllZip, handleAddRoot, handleDeleteRoot,
    selectMode, toggleSelectMode, selectedPaths, toggleSelectPath, bulkDeleting, bulkDeleteError,
    handleBulkDelete,
  };
}