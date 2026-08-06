import Icon from '@/components/ui/icon';
import type { ServerId } from './shared';
import { usePatches } from './usePatches';
import PatchesHelp from './PatchesHelp';
import PatchesToolbar from './PatchesToolbar';
import PatchesTree from './PatchesTree';

export default function Patches({
  canManage,
  canDelete,
  canLauncherUpload,
  tasks,
  initialTaskId,
  initialServerId,
  onFileTaskLinkChange,
}: {
  canManage: boolean;
  canDelete: boolean;
  canLauncherUpload: boolean;
  tasks: { id: string; title: string; server: ServerId }[];
  initialTaskId?: string | null;
  initialServerId?: ServerId | null;
  onFileTaskLinkChange?: () => void;
}) {
  const p = usePatches({ tasks, initialTaskId, initialServerId, onFileTaskLinkChange });

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

      <PatchesHelp />

      <PatchesToolbar
        servers={p.servers}
        active={p.active}
        setActive={p.setActive}
        tasksForServer={p.tasksForServer}
        selectedTaskId={p.selectedTaskId}
        setSelectedTaskId={p.setSelectedTaskId}
        handleDownloadTaskZip={p.handleDownloadTaskZip}
        taskFilesCount={p.taskFilesCount}
        zipping={p.zipping}
        canManage={canManage}
        uploading={p.uploading}
        uploadQueue={p.uploadQueue}
        uploadIndex={p.uploadIndex}
        fileProgress={p.fileProgress}
        handleCancelUpload={p.handleCancelUpload}
        uploadError={p.uploadError}
        launcherError={p.launcherError}
        canLauncherUpload={canLauncherUpload}
        launcherSyncing={p.launcherSyncing}
        launcherSyncResult={p.launcherSyncResult}
        handleLauncherSync={p.handleLauncherSync}
      />

      <PatchesTree
        activeSrv={p.activeSrv}
        files={p.files}
        totalSize={p.totalSize}
        handleDownloadAllZip={p.handleDownloadAllZip}
        zippingAll={p.zippingAll}
        canManage={canManage}
        canDelete={canDelete}
        canLauncherUpload={canLauncherUpload}
        addingRoot={p.addingRoot}
        setAddingRoot={p.setAddingRoot}
        newRootName={p.newRootName}
        setNewRootName={p.setNewRootName}
        rootError={p.rootError}
        setRootError={p.setRootError}
        handleAddRoot={p.handleAddRoot}
        loading={p.loading}
        tree={p.tree}
        handleDelete={p.handleDelete}
        selectedTaskId={p.selectedTaskId}
        handleDropFiles={p.handleDropFiles}
        dragActive={p.dragActive}
        setDragActive={p.setDragActive}
        handleToggleTask={p.handleToggleTask}
        togglingPath={p.togglingPath}
        customRootNames={p.customRootNames}
        handleDeleteRoot={p.handleDeleteRoot}
        deletingRoot={p.deletingRoot}
        setEditingDdfPath={p.setEditingDdfPath}
        isOwner={p.isOwner}
        customFiles={p.customFiles}
        customFolders={p.customFolders}
        savingDescKey={p.savingDescKey}
        saveDescription={p.saveDescription}
        deleteDescription={p.deleteDescription}
        launcherUploads={p.launcherUploads}
        handleLauncherUpload={p.handleLauncherUpload}
        launcherUploadingKey={p.launcherUploadingKey}
        descError={p.descError}
        editingDdfPath={p.editingDdfPath}
        active={p.active}
        selectMode={p.selectMode}
        toggleSelectMode={p.toggleSelectMode}
        selectedPaths={p.selectedPaths}
        toggleSelectPath={p.toggleSelectPath}
        toggleSelectFolder={p.toggleSelectFolder}
        bulkDeleting={p.bulkDeleting}
        bulkDeleteError={p.bulkDeleteError}
        handleBulkDelete={p.handleBulkDelete}
        zippingSelected={p.zippingSelected}
        handleDownloadSelectedZip={p.handleDownloadSelectedZip}
        rootLabels={p.rootLabels}
        renamingRootError={p.renamingRootError}
        handleRenameRoot={p.handleRenameRoot}
        renameFolderError={p.renameFolderError}
        handleRenameFolder={p.handleRenameFolder}
        deletingFolder={p.deletingFolder}
        deleteFolderError={p.deleteFolderError}
        handleDeleteFolder={p.handleDeleteFolder}
      />
    </div>
  );
}