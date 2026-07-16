import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { fileIconFor } from '@/components/AttachmentsField';
import { fmtFileSize } from './adminShared';
import type { AdminAttachment, FilesBySection } from './adminShared';

type SectionKey = 'knowledge' | 'ideas' | 'tasksActive' | 'tasksArchived';

const SECTIONS: { key: SectionKey; label: string; icon: string; section: 'knowledge' | 'ideas' | 'tasks'; urlParam: string }[] = [
  { key: 'knowledge', label: 'База знаний', icon: 'BookOpen', section: 'knowledge', urlParam: 'article' },
  { key: 'ideas', label: 'Идеи', icon: 'Lightbulb', section: 'ideas', urlParam: 'idea' },
  { key: 'tasksActive', label: 'Задачи', icon: 'ClipboardList', section: 'tasks', urlParam: 'task' },
  { key: 'tasksArchived', label: 'Задачи · в архиве', icon: 'Archive', section: 'tasks', urlParam: 'task' },
];

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalCount = files
    ? files.knowledge.length + files.ideas.length + files.tasksActive.length + files.tasksArchived.length
    : 0;
  const totalSize = files
    ? [...files.knowledge, ...files.ideas, ...files.tasksActive, ...files.tasksArchived].reduce((s, a) => s + (a.size || 0), 0)
    : 0;

  async function handleDelete(section: 'knowledge' | 'ideas' | 'tasks', a: AdminAttachment) {
    setDeletingId(a.id);
    try {
      await onDelete(section, a.entityId, a.id);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

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

        {loading ? (
          <div className="flex justify-center py-10">
            <Icon name="Loader2" size={22} className="animate-spin text-primary" />
          </div>
        ) : !files || totalCount === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Файлов пока нет</p>
        ) : (
          <div className="space-y-5">
            {SECTIONS.map((s) => {
              const items = files[s.key];
              if (!items.length) return null;
              return (
                <div key={s.key}>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Icon name={s.icon} size={13} />
                    {s.label}
                    <span className="font-mono">({items.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate block hover:underline hover:text-primary">
                            {a.name}
                          </a>
                          <div className="text-[11px] text-muted-foreground truncate">
                            <a
                              href={`/?${s.urlParam}=${a.entityId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline hover:text-primary"
                              title="Открыть источник"
                            >
                              {a.entityTitle}
                            </a>
                            {' · '}{fmtDate(a.updatedAt)}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtFileSize(a.size)}</span>
                        {confirmId === a.id ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleDelete(s.section, a)}
                              disabled={deletingId === a.id}
                              className="h-7 px-2 rounded-md bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-50"
                            >
                              {deletingId === a.id ? <Icon name="Loader2" size={12} className="animate-spin" /> : 'Да'}
                            </button>
                            <button onClick={() => setConfirmId(null)} className="h-7 px-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                              Нет
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(a.id)}
                            title="Удалить файл"
                            className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Icon name="Trash2" size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}