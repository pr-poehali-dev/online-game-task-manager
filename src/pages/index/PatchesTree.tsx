import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { ServerItem } from '@/lib/catalog';
import { fmtSize } from './patchesUtils';
import type { PatchFile, TreeNode, LauncherUploadsMap } from './patchesUtils';
import TreeFolder from './PatchesTreeFolder';
import PatchesDdfEditor from './PatchesDdfEditor';
import type { ServerId } from './shared';

export default function PatchesTree({
  activeSrv, files, totalSize, handleDownloadAllZip, zippingAll,
  canManage, canDelete, canLauncherUpload, addingRoot, setAddingRoot, newRootName, setNewRootName, rootError, setRootError,
  handleAddRoot, loading, tree, handleDelete, selectedTaskId, handleDropFiles,
  dragActive, setDragActive, handleToggleTask, togglingPath, customRootNames,
  handleDeleteRoot, deletingRoot, setEditingDdfPath, isOwner, customFiles, customFolders,
  savingDescKey, saveDescription, deleteDescription, launcherUploads, handleLauncherUpload,
  launcherUploadingKey, descError, editingDdfPath, active,
  selectMode, toggleSelectMode, selectedPaths, toggleSelectPath, bulkDeleting, bulkDeleteError,
  handleBulkDelete,
}: {
  activeSrv: ServerItem;
  files: PatchFile[];
  totalSize: number;
  handleDownloadAllZip: () => void;
  zippingAll: boolean;
  canManage: boolean;
  canDelete: boolean;
  canLauncherUpload: boolean;
  addingRoot: boolean;
  setAddingRoot: (v: boolean) => void;
  newRootName: string;
  setNewRootName: (v: string) => void;
  rootError: string;
  setRootError: (v: string) => void;
  handleAddRoot: () => void;
  loading: boolean;
  tree: TreeNode;
  handleDelete: (path: string) => void;
  selectedTaskId: string;
  handleDropFiles: (targetFolder: string, dropped: { path: string; file: File }[]) => void;
  dragActive: string | null;
  setDragActive: (v: string | null) => void;
  handleToggleTask: (path: string) => void;
  togglingPath: string | null;
  customRootNames: Set<string>;
  handleDeleteRoot: (name: string) => void;
  deletingRoot: string | null;
  setEditingDdfPath: (path: string | null) => void;
  isOwner: boolean;
  customFiles: Record<string, string>;
  customFolders: Record<string, string>;
  savingDescKey: string | null;
  saveDescription: (name: string, isFolder: boolean, text: string) => void;
  deleteDescription: (name: string, isFolder: boolean) => void;
  launcherUploads: LauncherUploadsMap;
  handleLauncherUpload: (path: string, target: 'fast' | 'full') => void;
  launcherUploadingKey: string | null;
  descError: string;
  editingDdfPath: string | null;
  active: ServerId;
  selectMode: boolean;
  toggleSelectMode: () => void;
  selectedPaths: Set<string>;
  toggleSelectPath: (path: string) => void;
  bulkDeleting: boolean;
  bulkDeleteError: string;
  handleBulkDelete: () => void;
}) {
  const [confirmBulk, setConfirmBulk] = useState(false);
  return (
    <>
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
            {canDelete && files.length > 0 && (
              <button
                onClick={toggleSelectMode}
                title={selectMode ? 'Выйти из режима выбора' : 'Выбрать несколько файлов для удаления'}
                className={`h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  selectMode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon name="CheckSquare" size={14} />
                {selectMode ? 'Отменить выбор' : 'Выбрать файлы'}
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

        {selectMode && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/20">
            <span className="text-xs text-muted-foreground">
              Выбрано файлов: {selectedPaths.size}
            </span>
            {confirmBulk ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted-foreground">Удалить {selectedPaths.size} файл(ов)?</span>
                <button
                  onClick={() => { setConfirmBulk(false); handleBulkDelete(); }}
                  disabled={bulkDeleting}
                  className="h-7 px-2.5 rounded-md bg-destructive/90 text-white text-xs font-medium hover:bg-destructive transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {bulkDeleting ? <Icon name="Loader2" size={13} className="animate-spin" /> : 'Да, удалить'}
                </button>
                <button
                  onClick={() => setConfirmBulk(false)}
                  disabled={bulkDeleting}
                  className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBulk(true)}
                disabled={selectedPaths.size === 0 || bulkDeleting}
                className="h-7 px-2.5 ml-auto rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
              >
                <Icon name="Trash2" size={13} />
                Удалить выбранное
              </button>
            )}
            {bulkDeleteError && <p className="text-xs text-destructive w-full">{bulkDeleteError}</p>}
          </div>
        )}

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
                  canDelete={canDelete}
                  canLauncherUpload={canLauncherUpload}
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
                  onEditDdf={setEditingDdfPath}
                  isOwner={isOwner}
                  customFileDescriptions={customFiles}
                  customFolderDescriptions={customFolders}
                  savingDescKey={savingDescKey}
                  onSaveDescription={saveDescription}
                  onDeleteDescription={deleteDescription}
                  launcherUploads={launcherUploads}
                  launcherFastEnabled={!!(activeSrv.launcherFastDir && activeSrv.launcherFastXml)}
                  launcherFullEnabled={!!(activeSrv.launcherFullDir && activeSrv.launcherFullXml)}
                  onLauncherUpload={handleLauncherUpload}
                  launcherUploadingKey={launcherUploadingKey}
                  selectMode={selectMode}
                  selectedPaths={selectedPaths}
                  onToggleSelectPath={toggleSelectPath}
                />
              </div>
            ))}
          </div>
        )}
        {descError && <p className="text-xs text-destructive px-4 py-2 border-t border-border">{descError}</p>}
      </div>

      {editingDdfPath && (
        <PatchesDdfEditor
          server={active}
          path={editingDdfPath}
          canManage={canManage}
          onClose={() => setEditingDdfPath(null)}
        />
      )}
    </>
  );
}