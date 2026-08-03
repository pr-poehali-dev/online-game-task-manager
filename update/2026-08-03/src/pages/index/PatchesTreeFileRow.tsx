import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { formatMskDateTime } from './shared';
import { fmtSize } from './patchesUtils';
import type { TreeNode, LauncherUploadsMap } from './patchesUtils';
import { describeFile, normalizeKey } from './patchesFileDescriptions';
import InfoHint from './PatchesInfoHint';
import LauncherUploadButton, { launcherFileStatus } from './PatchesLauncherUploadButton';

// Рендер одной строки-файла в дереве патчей (see TreeFolder — node.isFile && node.file).
// Вынесено отдельным компонентом 1:1 из исходной логики TreeFolder, включая собственное
// локальное состояние подтверждения удаления (confirmPath), которое было локальным и в исходном
// файле — актуально только для данной строки.
export default function TreeFileRow({
  node,
  depth,
  canManage,
  canDelete = false,
  canLauncherUpload = false,
  onDelete,
  highlightTaskId,
  onToggleTask,
  togglingPath,
  onEditDdf,
  isOwner = false,
  customFileDescriptions = {},
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
}: {
  node: TreeNode;
  depth: number;
  canManage: boolean;
  canDelete?: boolean;
  canLauncherUpload?: boolean;
  onDelete: (path: string) => void;
  highlightTaskId: string | null;
  onToggleTask: (path: string) => void;
  togglingPath: string | null;
  onEditDdf?: (path: string) => void;
  isOwner?: boolean;
  customFileDescriptions?: Record<string, string>;
  savingDescKey?: string | null;
  onSaveDescription: (name: string, isFolder: boolean, text: string) => void;
  onDeleteDescription: (name: string, isFolder: boolean) => void;
  launcherUploads?: LauncherUploadsMap;
  launcherFastEnabled?: boolean;
  launcherFullEnabled?: boolean;
  onLauncherUpload?: (path: string, target: 'fast' | 'full') => void;
  launcherUploadingKey?: string | null;
  selectMode?: boolean;
  selectedPaths?: Set<string>;
  onToggleSelectPath?: (path: string) => void;
}) {
  const [confirmPath, setConfirmPath] = useState<string | null>(null);

  const f = node.file!;
  const highlighted = !!highlightTaskId && f.taskIds.includes(highlightTaskId);
  const fileKey = normalizeKey(node.name);
  const fileInfo = describeFile(node.name, customFileDescriptions);
  const isSelected = !!selectedPaths?.has(f.path);
  return (
    <div
      className={`flex items-center gap-2 py-1.5 pr-2 rounded-md transition-colors group ${
        isSelected ? 'bg-primary/10' : highlighted ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/40'
      }`}
      style={{ paddingLeft: `${depth * 18 + 24}px` }}
    >
      {canDelete && selectMode && onToggleSelectPath && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelectPath(f.path)}
          className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary cursor-pointer"
        />
      )}
      {(fileInfo || isOwner) && (
        <InfoHint
          title={node.name}
          description={fileInfo?.description || ''}
          isOwner={isOwner}
          saving={savingDescKey === fileKey}
          hasCustom={fileKey in customFileDescriptions}
          onSave={(text) => onSaveDescription(node.name, false, text)}
          onDelete={() => onDeleteDescription(node.name, false)}
        />
      )}
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
      {f.ddfSupported && onEditDdf && (
        <button
          onClick={() => onEditDdf(f.path)}
          title="Редактировать текст (названия, описания)"
          className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Icon name="FileText" size={13} />
        </button>
      )}
      {canLauncherUpload && onLauncherUpload && (launcherFastEnabled || launcherFullEnabled) && (
        <div className="shrink-0 flex items-center gap-1">
          {launcherFastEnabled && (
            <LauncherUploadButton
              label="Б"
              title="Залить в быстрое обновление"
              uploading={launcherUploadingKey === `${f.path}:fast`}
              status={launcherFileStatus(f.hash, launcherUploads[f.path]?.fast)}
              onClick={() => onLauncherUpload(f.path, 'fast')}
            />
          )}
          {launcherFullEnabled && (
            <LauncherUploadButton
              label="П"
              title="Залить в полное обновление"
              uploading={launcherUploadingKey === `${f.path}:full`}
              status={launcherFileStatus(f.hash, launcherUploads[f.path]?.full)}
              onClick={() => onLauncherUpload(f.path, 'full')}
            />
          )}
        </div>
      )}
      {canManage && highlightTaskId && (
        <button
          onClick={() => onToggleTask(f.path)}
          disabled={togglingPath === f.path}
          title={highlighted ? 'Открепить от задачи' : 'Прикрепить к задаче'}
          className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 ${
            highlighted
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100'
          }`}
        >
          <Icon name={togglingPath === f.path ? 'Loader2' : 'Paperclip'} size={13} className={togglingPath === f.path ? 'animate-spin' : ''} />
        </button>
      )}
      {canDelete && (confirmPath === f.path ? (
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
