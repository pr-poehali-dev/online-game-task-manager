import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCatalog } from '@/lib/catalog';
import { authHeaders, PATCHES_URL } from './shared';
import type { ServerId } from './shared';
import { buildTree } from './patchesUtils';
import type { PatchFile, DroppedFile, LauncherUploadsMap, RootLabelsMap } from './patchesUtils';
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
  const [rootLabels, setRootLabels] = useState<RootLabelsMap>({});
  const [renamingRootError, setRenamingRootError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [zippingAll, setZippingAll] = useState(false);
  const [zippingSelected, setZippingSelected] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[] | null>(null);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [fileProgress, setFileProgress] = useState(0);
  const [togglingPath, setTogglingPath] = useState<string | null>(null);
  const [launcherUploadingKey, setLauncherUploadingKey] = useState<string | null>(null);
  const [launcherError, setLauncherError] = useState('');
  const [launcherSyncing, setLauncherSyncing] = useState(false);
  const [launcherSyncResult, setLauncherSyncResult] = useState<string>('');
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const [rootError, setRootError] = useState('');
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null);
  const [renameFolderError, setRenameFolderError] = useState('');
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [deleteFolderError, setDeleteFolderError] = useState('');
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
        setRootLabels(data.rootLabels || {});
      } else {
        // Запрос за деревом файлов не удался (например сервер не найден) — обязательно очищаем
        // список, иначе на экране остаётся дерево ПРЕДЫДУЩЕГО открытого сервера и выглядит так,
        // будто это файлы нового/только что выбранного сервера.
        setFiles([]);
        setCustomRoots([]);
        setLauncherUploads({});
        setRootLabels({});
      }
    } catch {
      setFiles([]);
      setCustomRoots([]);
      setLauncherUploads({});
      setRootLabels({});
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

  // Отмечает/снимает разом все файлы внутри папки (в т.ч. вложенные подпапки) — folderPaths это
  // результат collectFilePaths(node) для конкретного узла папки в дереве. Если внутри уже отмечены
  // все файлы — снимает выбор со всех, иначе выделяет оставшиеся (обычное поведение "выбрать всё").
  function toggleSelectFolder(folderPaths: string[]) {
    if (folderPaths.length === 0) return;
    setSelectedPaths((prev) => {
      const allSelected = folderPaths.every((p) => prev.has(p));
      const next = new Set(prev);
      if (allSelected) folderPaths.forEach((p) => next.delete(p));
      else folderPaths.forEach((p) => next.add(p));
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
        setLauncherError(`Не удалось залить файл на сервер лаунчера — проверьте подключение и попробуйте ещё раз${code ? ` (код: ${code})` : ''}`);
      }
    } finally {
      setLauncherUploadingKey(null);
    }
  }

  // Сверяет статус "залито в лаунчер" с реальным содержимым XML-реестра на VPS (см. action
  // launcher_sync в backend/patches/index.py) — нужно, если файл был залит на хостинг лаунчера в
  // обход этого приложения (например вручную по FTP, с ручной правкой того же XML).
  async function handleLauncherSync() {
    setLauncherSyncing(true);
    setLauncherError('');
    setLauncherSyncResult('');
    try {
      const data = await postJson({ action: 'launcher_sync', server: active });
      setLauncherUploads(data.launcherUploads || {});
      setLauncherSyncResult(
        data.matched > 0
          ? `Сверка завершена: найдено совпадений — ${data.matched}`
          : 'Сверка завершена: совпадений с хостингом не найдено'
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'launcher_paths_not_configured') {
        setLauncherError('Для этого сервера не заданы пути лаунчера — заполните их в «Управление проектом → Серверы»');
      } else if (code === 'ssh_not_configured') {
        setLauncherError('SSH-доступ к серверу лаунчера не настроен — заполните его в «Управление проектом → Служебные ключи»');
      } else {
        setLauncherError(`Не удалось сверить статусы с лаунчером — проверьте подключение и попробуйте ещё раз${code ? ` (код: ${code})` : ''}`);
      }
    } finally {
      setLauncherSyncing(false);
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

  // Скачивает архивом только отмеченные чекбоксами файлы (см. Patches → "Выбрать файлы") — см.
  // action='zip_bulk' в backend/patches/index.py.
  async function handleDownloadSelectedZip() {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;
    setZippingSelected(true);
    try {
      const data = await postJson({ action: 'zip_bulk', server: active, paths });
      if (data.url) window.open(data.url, '_blank');
    } catch {
      /* ignore */
    } finally {
      setZippingSelected(false);
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

  // Меняет ТОЛЬКО отображаемое имя корневой папки в дереве (см. action rename_root в
  // backend/patches/index.py) — реальный путь файлов и путь в XML-реестре лаунчера при заливке
  // не меняются, регистр там и так приводится к нижнему автоматически. label === '' сбрасывает
  // подпись обратно на исходное имя папки.
  async function handleRenameRoot(rootName: string, label: string) {
    setRenamingRootError('');
    try {
      await postJson({ action: 'rename_root', server: active, rootName, label });
      setRootLabels((prev) => {
        const next = { ...prev };
        if (label) next[rootName] = label;
        else delete next[rootName];
        return next;
      });
    } catch {
      setRenamingRootError('Не удалось переименовать папку');
    }
  }

  // Переименовывает ПРОИЗВОЛЬНУЮ вложенную папку (не корень) физически — см. action rename_folder
  // в backend/patches/index.py: все файлы внутри переносятся на S3 под новым путём, дерево
  // перезагружается целиком, т.к. меняются пути сразу у многих файлов.
  async function handleRenameFolder(path: string, newName: string) {
    setRenameFolderError('');
    try {
      await postJson({ action: 'rename_folder', server: active, path, newName });
      await load(active);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'name_taken') setRenameFolderError('Папка с таким именем уже существует');
      else if (code === 'bad_name') setRenameFolderError('Недопустимое имя папки');
      else setRenameFolderError('Не удалось переименовать папку');
    }
  }

  // Удаляет ПРОИЗВОЛЬНУЮ вложенную папку целиком со всеми файлами внутри — см. action
  // delete_folder в backend/patches/index.py.
  async function handleDeleteFolder(path: string) {
    setDeletingFolder(path);
    setDeleteFolderError('');
    try {
      await postJson({ action: 'delete_folder', server: active, path });
      await load(active);
      onFileTaskLinkChange?.();
    } catch {
      setDeleteFolderError('Не удалось удалить папку — попробуйте ещё раз');
    } finally {
      setDeletingFolder(null);
    }
  }

  return {
    servers, active, setActive,
    files, launcherUploads,
    loading, uploadError, zipping, zippingAll, zippingSelected,
    selectedTaskId, setSelectedTaskId,
    dragActive, setDragActive,
    uploadQueue, uploadIndex, fileProgress,
    togglingPath, launcherUploadingKey, launcherError, launcherSyncing, launcherSyncResult, handleLauncherSync,
    addingRoot, setAddingRoot, newRootName, setNewRootName, rootError, setRootError,
    deletingRoot, editingDdfPath, setEditingDdfPath,
    rootLabels, renamingRootError, handleRenameRoot,
    renameFolderError, handleRenameFolder,
    deletingFolder, deleteFolderError, handleDeleteFolder,
    uploading,
    customFiles, customFolders, isOwner, savingDescKey, descError, saveDescription, deleteDescription,
    tree, customRootNames, totalSize, activeSrv, tasksForServer, taskFilesCount,
    handleDropFiles, handleCancelUpload, handleDelete, handleToggleTask, handleLauncherUpload,
    handleDownloadTaskZip, handleDownloadAllZip, handleAddRoot, handleDeleteRoot,
    selectMode, toggleSelectMode, selectedPaths, toggleSelectPath, toggleSelectFolder,
    bulkDeleting, bulkDeleteError, handleBulkDelete, handleDownloadSelectedZip,
  };
}