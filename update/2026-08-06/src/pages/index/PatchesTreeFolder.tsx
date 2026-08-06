import { useState, useMemo, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { collectDroppedFiles, collectFilePaths } from './patchesUtils';
import type { TreeNode, DroppedFile, LauncherUploadsMap } from './patchesUtils';
import { describeFolder } from './patchesFileDescriptions';
import InfoHint from './PatchesInfoHint';
import TreeFileRow from './PatchesTreeFileRow';

// Проверяет, есть ли внутри папки (в т.ч. вложенных) файл, прикреплённый к задаче
function containsTask(node: TreeNode, taskId: string): boolean {
  if (node.isFile) return !!node.file?.taskIds.includes(taskId);
  for (const child of node.children.values()) {
    if (containsTask(child, taskId)) return true;
  }
  return false;
}

export default function TreeFolder({
  node,
  depth,
  canManage,
  canDelete = false,
  canLauncherUpload = false,
  onDelete,
  highlightTaskId,
  onDropFiles,
  dragActive,
  setDragActive,
  onToggleTask,
  togglingPath,
  customRootNames,
  onDeleteRoot,
  deletingRoot,
  onEditDdf,
  isOwner = false,
  customFileDescriptions = {},
  customFolderDescriptions = {},
  savingDescKey = null,
  onSaveDescription,
  onDeleteDescription,
  launcherUploads = {},
  launcherFastEnabled = false,
  launcherFullEnabled = false,
  onLauncherUpload,
  launcherUploadingKey = null,
  selectMode = false,
  selectedPaths,
  onToggleSelectPath,
  onToggleSelectFolder,
  rootLabel,
  onRenameRoot,
  onRenameFolder,
  onDeleteFolder,
  deletingFolder,
}: {
  node: TreeNode;
  depth: number;
  canManage: boolean;
  // Точечные права поверх canManage/patch_edit — удаление файлов и заливка в лаунчер (см.
  // patch_delete_files/patch_launcher_upload в src/lib/auth.tsx) требуют patch_edit как
  // предусловие, но управляются отдельными чекбоксами в дереве прав.
  canDelete?: boolean;
  canLauncherUpload?: boolean;
  onDelete: (path: string) => void;
  highlightTaskId: string | null;
  onDropFiles: (targetFolder: string, files: DroppedFile[]) => void;
  dragActive: string | null;
  setDragActive: (path: string | null) => void;
  onToggleTask: (path: string) => void;
  togglingPath: string | null;
  customRootNames?: Set<string>;
  onDeleteRoot?: (name: string) => void;
  deletingRoot?: string | null;
  onEditDdf?: (path: string) => void;
  isOwner?: boolean;
  customFileDescriptions?: Record<string, string>;
  customFolderDescriptions?: Record<string, string>;
  savingDescKey?: string | null;
  onSaveDescription: (name: string, isFolder: boolean, text: string) => void;
  onDeleteDescription: (name: string, isFolder: boolean) => void;
  // Заливка файлов на VPS игрового лаунчера (см. LAUNCHER_UPLOAD.md) — launcherFastEnabled/
  // launcherFullEnabled управляются наличием путей в настройках сервера (CabinetServers.tsx),
  // launcherUploads — статус последней заливки каждого файла для сравнения с текущим hash.
  launcherUploads?: LauncherUploadsMap;
  launcherFastEnabled?: boolean;
  launcherFullEnabled?: boolean;
  onLauncherUpload?: (path: string, target: 'fast' | 'full') => void;
  launcherUploadingKey?: string | null;
  // Режим массового выбора файлов чекбоксами для удаления пачкой (см. Patches → "Выбрать файлы").
  selectMode?: boolean;
  selectedPaths?: Set<string>;
  onToggleSelectPath?: (path: string) => void;
  // Чекбокс папки отмечает/снимает разом все файлы внутри неё (в т.ч. вложенные подпапки) — см.
  // toggleSelectFolder в usePatches.ts.
  onToggleSelectFolder?: (folderPaths: string[]) => void;
  // Пользовательская подпись корневой папки (см. patch_root_labels в backend/patches/index.py) —
  // переопределяет отображаемое имя ТОЛЬКО в дереве, реальный путь файла (node.path) не меняется.
  rootLabel?: string;
  onRenameRoot?: (rootName: string, label: string) => void;
  // Переименование/удаление ПРОИЗВОЛЬНОЙ вложенной папки (depth > 0) — в отличие от rename_root/
  // delete_root (только корень), эти действия физически переносят/удаляют файлы по префиксу пути
  // (см. actions rename_folder/delete_folder в backend/patches/index.py), т.к. у вложенных папок
  // нет отдельной сущности в БД.
  onRenameFolder?: (path: string, newName: string) => void;
  onDeleteFolder?: (path: string) => void;
  deletingFolder?: string | null;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [confirmRoot, setConfirmRoot] = useState(false);
  const [renamingRoot, setRenamingRoot] = useState(false);
  const [rootNameDraft, setRootNameDraft] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const isRoot = depth === 0;
  const entries = useMemo(() => {
    const arr = Array.from(node.children.values());
    arr.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [node]);

  // Автораскрытие папки, если внутри неё (в т.ч. во вложенных подпапках) есть файл нужной задачи
  useEffect(() => {
    if (highlightTaskId && !node.isFile && containsTask(node, highlightTaskId)) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTaskId, node]);

  // Чекбокс папки в режиме выбора файлов — отмечает/снимает разом все файлы внутри (в т.ч.
  // вложенные подпапки). folderPaths считаем только пока реально нужно (selectMode включён).
  const folderPaths = useMemo(
    () => (selectMode && !node.isFile ? collectFilePaths(node) : []),
    [node, selectMode]
  );
  const folderSelectedCount = useMemo(
    () => (folderPaths.length ? folderPaths.filter((p) => selectedPaths?.has(p)).length : 0),
    [folderPaths, selectedPaths]
  );
  const folderAllSelected = folderPaths.length > 0 && folderSelectedCount === folderPaths.length;
  const folderSomeSelected = folderSelectedCount > 0 && !folderAllSelected;
  const folderCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (folderCheckboxRef.current) folderCheckboxRef.current.indeterminate = folderSomeSelected;
  }, [folderSomeSelected]);

  if (node.isFile && node.file) {
    return (
      <TreeFileRow
        node={node}
        depth={depth}
        canManage={canManage}
        canDelete={canDelete}
        canLauncherUpload={canLauncherUpload}
        onDelete={onDelete}
        highlightTaskId={highlightTaskId}
        onToggleTask={onToggleTask}
        togglingPath={togglingPath}
        onEditDdf={onEditDdf}
        isOwner={isOwner}
        customFileDescriptions={customFileDescriptions}
        savingDescKey={savingDescKey}
        onSaveDescription={onSaveDescription}
        onDeleteDescription={onDeleteDescription}
        launcherUploads={launcherUploads}
        launcherFastEnabled={launcherFastEnabled}
        launcherFullEnabled={launcherFullEnabled}
        onLauncherUpload={onLauncherUpload}
        launcherUploadingKey={launcherUploadingKey}
        selectMode={selectMode}
        selectedPaths={selectedPaths}
        onToggleSelectPath={onToggleSelectPath}
      />
    );
  }

  const isDragTarget = dragActive === node.path;
  const isCustomRoot = isRoot && !!customRootNames?.has(node.name);
  // delete_root удаляет ПУСТУЮ пользовательскую корневую папку (структура дерева) — backend
  // проверяет это действие через can_manage (patch_edit), а не can_delete (удаление ФАЙЛОВ,
  // см. patch_delete_files) — держим то же разделение на фронте для консистентности.
  const canDeleteRoot = isCustomRoot && canManage && entries.length === 0 && !!onDeleteRoot;
  const folderKey = node.name.toLowerCase();
  const folderInfo = describeFolder(node.name, customFolderDescriptions);

  return (
    <div className="group/root">
      <div
        onDragOver={canManage ? (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(node.path); } : undefined}
        onDragLeave={canManage ? (e) => { e.stopPropagation(); setDragActive(null); } : undefined}
        onDrop={canManage ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(null);
          collectDroppedFiles(e.dataTransfer).then((files) => onDropFiles(node.path, files));
        } : undefined}
        className={`flex items-center gap-2 py-1.5 pr-2 rounded-md transition-colors w-full ${
          isDragTarget ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-secondary/40'
        }`}
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        {canDelete && selectMode && onToggleSelectFolder && folderPaths.length > 0 && (
          <input
            ref={folderCheckboxRef}
            type="checkbox"
            checked={folderAllSelected}
            onChange={() => onToggleSelectFolder(folderPaths)}
            title="Выбрать все файлы в папке"
            className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary cursor-pointer"
          />
        )}
        {(folderInfo || (isOwner && isRoot)) && (
          <InfoHint
            title={node.name}
            description={folderInfo?.description || ''}
            isOwner={isOwner}
            saving={savingDescKey === folderKey}
            hasCustom={folderKey in customFolderDescriptions}
            onSave={(text) => onSaveDescription(node.name, true, text)}
            onDelete={() => onDeleteDescription(node.name, true)}
          />
        )}
        {renamingRoot ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
            <input
              autoFocus
              value={rootNameDraft}
              onChange={(e) => setRootNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRenameRoot?.(node.path, rootNameDraft.trim()); setRenamingRoot(false); }
                if (e.key === 'Escape') setRenamingRoot(false);
              }}
              placeholder={node.name}
              className="h-7 flex-1 min-w-0 px-2 rounded-md border border-border bg-background text-sm"
            />
            <button
              onClick={() => { onRenameRoot?.(node.path, rootNameDraft.trim()); setRenamingRoot(false); }}
              className="text-xs text-primary hover:underline shrink-0"
            >
              OK
            </button>
            <button
              onClick={() => setRenamingRoot(false)}
              className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="X" size={13} />
            </button>
          </div>
        ) : renamingFolder ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
            <input
              autoFocus
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderNameDraft.trim()) { onRenameFolder?.(node.path, folderNameDraft.trim()); setRenamingFolder(false); }
                if (e.key === 'Escape') setRenamingFolder(false);
              }}
              placeholder={node.name}
              className="h-7 flex-1 min-w-0 px-2 rounded-md border border-border bg-background text-sm"
            />
            <button
              onClick={() => { if (folderNameDraft.trim()) { onRenameFolder?.(node.path, folderNameDraft.trim()); setRenamingFolder(false); } }}
              className="text-xs text-primary hover:underline shrink-0"
            >
              OK
            </button>
            <button
              onClick={() => setRenamingFolder(false)}
              className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="X" size={13} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground shrink-0" />
              <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
              <span className="text-sm font-medium truncate">{rootLabel || node.name}</span>
            </button>
            {isRoot && canManage && onRenameRoot && (
              <button
                onClick={() => { setRootNameDraft(rootLabel || node.name); setRenamingRoot(true); }}
                title="Переименовать отображаемое имя папки (реальный путь файлов не меняется)"
                className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover/root:opacity-100"
              >
                <Icon name="Pencil" size={12} />
              </button>
            )}
            {!isRoot && canManage && onRenameFolder && (
              <button
                onClick={() => { setFolderNameDraft(node.name); setRenamingFolder(true); }}
                title="Переименовать папку (переносит все файлы внутри неё)"
                className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover/root:opacity-100"
              >
                <Icon name="Pencil" size={12} />
              </button>
            )}
            {!isRoot && canDelete && onDeleteFolder && !confirmDeleteFolder && (
              <button
                onClick={() => setConfirmDeleteFolder(true)}
                disabled={deletingFolder === node.path}
                title="Удалить папку со всем содержимым"
                className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/root:opacity-100 disabled:opacity-40"
              >
                <Icon name={deletingFolder === node.path ? 'Loader2' : 'Trash2'} size={12} className={deletingFolder === node.path ? 'animate-spin' : ''} />
              </button>
            )}
            {!isRoot && confirmDeleteFolder && (
              <div className="shrink-0 flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Удалить со всеми файлами?</span>
                <button
                  onClick={() => { setConfirmDeleteFolder(false); onDeleteFolder?.(node.path); }}
                  className="h-6 px-2 rounded-md bg-destructive/90 text-white text-[11px] hover:bg-destructive transition-colors"
                >
                  Да
                </button>
                <button
                  onClick={() => setConfirmDeleteFolder(false)}
                  className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Нет
                </button>
              </div>
            )}
            {canManage && (
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0 opacity-0 group-hover/root:opacity-100">перетащите файл или папку сюда</span>
            )}
          </>
        )}
        {canDeleteRoot && (confirmRoot ? (
          <div className="shrink-0 flex items-center gap-1 pr-1">
            <button
              onClick={() => { setConfirmRoot(false); onDeleteRoot?.(node.name); }}
              className="h-6 px-2 rounded-md bg-destructive/90 text-white text-[11px] hover:bg-destructive transition-colors"
            >
              Да
            </button>
            <button
              onClick={() => setConfirmRoot(false)}
              className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Нет
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRoot(true)}
            disabled={deletingRoot === node.name}
            title="Удалить папку"
            className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/root:opacity-100 disabled:opacity-40 mr-1"
          >
            <Icon name={deletingRoot === node.name ? 'Loader2' : 'Trash2'} size={13} className={deletingRoot === node.name ? 'animate-spin' : ''} />
          </button>
        ))}
      </div>
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
              canDelete={canDelete}
              canLauncherUpload={canLauncherUpload}
              onDelete={onDelete}
              highlightTaskId={highlightTaskId}
              onDropFiles={onDropFiles}
              dragActive={dragActive}
              setDragActive={setDragActive}
              onToggleTask={onToggleTask}
              togglingPath={togglingPath}
              customRootNames={customRootNames}
              onDeleteRoot={onDeleteRoot}
              deletingRoot={deletingRoot}
              onEditDdf={onEditDdf}
              isOwner={isOwner}
              customFileDescriptions={customFileDescriptions}
              customFolderDescriptions={customFolderDescriptions}
              savingDescKey={savingDescKey}
              onSaveDescription={onSaveDescription}
              onDeleteDescription={onDeleteDescription}
              launcherUploads={launcherUploads}
              launcherFastEnabled={launcherFastEnabled}
              launcherFullEnabled={launcherFullEnabled}
              onLauncherUpload={onLauncherUpload}
              launcherUploadingKey={launcherUploadingKey}
              selectMode={selectMode}
              selectedPaths={selectedPaths}
              onToggleSelectPath={onToggleSelectPath}
              onToggleSelectFolder={onToggleSelectFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              deletingFolder={deletingFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}