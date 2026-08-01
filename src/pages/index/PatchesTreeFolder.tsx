import { useState, useMemo, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatMskDateTime } from './shared';
import { fmtSize, collectDroppedFiles } from './patchesUtils';
import type { TreeNode, DroppedFile, LauncherUploadsMap, LauncherUploadInfo } from './patchesUtils';
import { describeFile, describeFolder, normalizeKey } from './patchesFileDescriptions';

// Статус заливки файла на VPS лаунчера относительно его текущего hash (см. LAUNCHER_UPLOAD.md):
// не заливался ни разу / залита именно эта версия файла / заливали, но файл с тех пор обновился.
type LauncherFileStatus = 'none' | 'uploaded' | 'stale';

function launcherFileStatus(fileHash: string | null | undefined, upload: LauncherUploadInfo | undefined): LauncherFileStatus {
  if (!upload) return 'none';
  if (fileHash && upload.hash === fileHash) return 'uploaded';
  return 'stale';
}

// Маленькая круглая кнопка-бейдж заливки в лаунчер: буква Б (быстрое) или П (полное) внутри
// кружка, цвет меняется по статусу — серый (не заливалось), зелёный (актуально), жёлтый
// (устарело, файл обновлён после последней заливки).
function LauncherUploadButton({ label, title, uploading, status, onClick }: {
  label: string;
  title: string;
  uploading: boolean;
  status: LauncherFileStatus;
  onClick: () => void;
}) {
  const colorClass = status === 'uploaded'
    ? 'text-primary border-primary/40 bg-primary/10 hover:bg-primary/20'
    : status === 'stale'
      ? 'text-amber-500 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
      : 'text-muted-foreground border-border hover:bg-secondary';
  const statusTitle = status === 'uploaded' ? ' — залито' : status === 'stale' ? ' — устарело, требуется перезалить' : '';
  return (
    <button
      onClick={onClick}
      disabled={uploading}
      title={title + statusTitle}
      className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-semibold transition-colors disabled:opacity-40 ${colorClass}`}
    >
      {uploading ? <Icon name="Loader2" size={11} className="animate-spin" /> : label}
    </button>
  );
}

// Кнопка-подсказка с описанием назначения файла/папки игрового клиента (см.
// patchesFileDescriptions.ts — встроенный статический справочник + пользовательские описания с
// backend, см. useDdfFileDescriptions — сопоставляется по ИМЕНИ файла/папки, а не по конкретной
// загруженной записи, поэтому подсказка появляется автоматически даже для файла, который будет
// залит только в будущем). Если для имени нет ни встроенного, ни пользовательского описания И
// пользователь не владелец (isOwner=false, не может создать новое) — кнопка не рендерится вовсе.
//
// isOwner (см. OWNER_USER_ID в backend/patches/index.py) даёт доступ к режиму редактирования
// прямо во всплывающей подсказке — textarea + Сохранить/Удалить. Реальная защита — на backend
// (patch_desc_save/patch_desc_delete отклоняют запрос не от владельца с 403), это лишь UI.
function InfoHint({
  title,
  description,
  isOwner,
  saving,
  onSave,
  onDelete,
  hasCustom,
}: {
  title: string;
  description: string;
  isOwner: boolean;
  saving: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
  hasCustom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);

  useEffect(() => { setDraft(description); }, [description]);

  return (
    <Tooltip open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(false); }} delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center transition-colors ${
            description ? 'text-muted-foreground hover:text-primary hover:bg-primary/10' : 'text-muted-foreground/40 hover:text-primary hover:bg-primary/10'
          }`}
        >
          <Icon name="Info" size={13} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium mb-1">{title}</p>
        {editing ? (
          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-56 px-2 py-1.5 rounded-md border border-border bg-background text-xs resize-y"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { onSave(draft); setEditing(false); }}
                disabled={saving || !draft.trim()}
                className="h-6 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Сохраняю...' : 'Сохранить'}
              </button>
              <button
                onClick={() => { setDraft(description); setEditing(false); }}
                className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <>
            {description && <p className="text-xs text-muted-foreground mb-1.5">{description}</p>}
            {isOwner && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(true)}
                  className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Icon name="Pencil" size={11} />
                  {description ? 'Изменить' : 'Добавить описание'}
                </button>
                {hasCustom && (
                  <button
                    onClick={onDelete}
                    disabled={saving}
                    className="h-6 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

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
}: {
  node: TreeNode;
  depth: number;
  canManage: boolean;
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
}) {
  const [open, setOpen] = useState(depth === 0);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [confirmRoot, setConfirmRoot] = useState(false);
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

  if (node.isFile && node.file) {
    const f = node.file;
    const highlighted = !!highlightTaskId && f.taskIds.includes(highlightTaskId);
    const fileKey = normalizeKey(node.name);
    const fileInfo = describeFile(node.name, customFileDescriptions);
    return (
      <div
        className={`flex items-center gap-2 py-1.5 pr-2 rounded-md transition-colors group ${
          highlighted ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/40'
        }`}
        style={{ paddingLeft: `${depth * 18 + 24}px` }}
      >
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
        {canManage && onLauncherUpload && (launcherFastEnabled || launcherFullEnabled) && (
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

  const isDragTarget = dragActive === node.path;
  const isCustomRoot = isRoot && !!customRootNames?.has(node.name);
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
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground shrink-0" />
          <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
          <span className="text-sm font-medium truncate">{node.name}</span>
        </button>
        {canManage && (
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0 opacity-0 group-hover/root:opacity-100">перетащите файл или папку сюда</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}