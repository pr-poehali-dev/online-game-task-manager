import Icon from '@/components/ui/icon';
import FilesList from './FilesList';
import { fmtFileSize } from './adminShared';
import type { FilesBySection } from './adminShared';

export default function FilesModal({
  onClose,
  loading,
  files,
  onDelete,
}: {
  onClose: () => void;
  loading: boolean;
  files: FilesBySection | null;
  onDelete: (section: 'knowledge' | 'ideas' | 'tasks', entityId: string, attachmentId: string) => Promise<void>;
}) {
  const totalCount = files
    ? files.knowledge.length + files.ideas.length + files.tasksActive.length + files.tasksArchived.length
    : 0;
  const totalSize = files
    ? [...files.knowledge, ...files.ideas, ...files.tasksActive, ...files.tasksArchived].reduce((s, a) => s + (a.size || 0), 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Залитые файлы</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Загрузка...' : `${totalCount} файлов · ${fmtFileSize(totalSize)}`}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        <FilesList loading={loading} files={files} onDelete={onDelete} />
      </div>
    </div>
  );
}
