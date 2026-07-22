import { useState, useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { formatMskDateTime } from './shared';
import { fmtSize, collectDroppedFiles } from './patchesUtils';
import type { TreeNode, DroppedFile } from './patchesUtils';

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
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          style={{ paddingLeft: `${depth * 18 + 4}px` }}
        >
          <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground shrink-0" />
          <Icon name={open ? 'FolderOpen' : 'Folder'} size={15} className="shrink-0" style={{ color: 'hsl(45 90% 55%)' }} />
          <span className="text-sm font-medium truncate">{node.name}</span>
          {canManage && (
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0 opacity-0 group-hover/root:opacity-100">перетащите файл или папку сюда</span>
          )}
        </button>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}