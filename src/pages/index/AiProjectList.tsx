import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { AiProject } from './useAiProjects';

interface AiProjectListProps {
  projects: AiProject[];
  loading: boolean;
  activeProjectId: number | null;
  usedProjects: number;
  limitProjects: number;
  error: string;
  onOpenProject: (id: number | null) => void;
  onCreateProject: (name: string) => void;
}

// AiProjectList — секция «Проекты» над списком диалогов: сворачиваемое дерево с созданием прямо
// на месте. Архивные проекты скрыты под отдельным переключателем, чтобы не засорять список.
export default function AiProjectList({
  projects,
  loading,
  activeProjectId,
  usedProjects,
  limitProjects,
  error,
  onOpenProject,
  onCreateProject,
}: AiProjectListProps) {
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const visible = showArchived ? archived : active;
  const limitReached = limitProjects > 0 && usedProjects >= limitProjects;

  function commitCreate() {
    const name = newName.trim();
    if (name) onCreateProject(name);
    setNewName('');
    setCreating(false);
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-1 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={11} className="shrink-0" />
          Проекты
          {limitProjects > 0 && (
            <span className={`ml-auto normal-case tracking-normal ${limitReached ? 'text-destructive' : ''}`}>
              {usedProjects}/{limitProjects}
            </span>
          )}
        </button>
        <button
          onClick={() => { setCreating(true); setOpen(true); }}
          disabled={limitReached}
          title={limitReached ? 'Достигнут лимит проектов' : 'Новый проект'}
          className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
        >
          <Icon name="Plus" size={13} />
        </button>
      </div>

      {open && (
        <div className="px-2 pb-2 space-y-0.5">
          {/* Явная кнопка-близнец «Нового чата»: маленький плюсик у заголовка сотрудники не
              замечали, и создать проект было неочевидно. */}
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              disabled={limitReached}
              title={limitReached ? 'Достигнут лимит проектов' : 'Создать новый проект'}
              className="w-full h-9 px-3 mb-1 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Icon name="Plus" size={15} />
              Новый проект
            </button>
          )}
          {creating && (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') { setNewName(''); setCreating(false); }
              }}
              placeholder="Название проекта"
              className="w-full h-8 px-2.5 rounded-lg border border-border bg-secondary/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}

          {error && (
            <div className="text-[11px] text-destructive px-1 py-1 flex items-start gap-1.5">
              <Icon name="AlertCircle" size={11} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-3 flex justify-center">
              <Icon name="Loader2" size={14} className="animate-spin text-primary" />
            </div>
          ) : visible.length === 0 ? (
            !creating && (
              <div className="text-[11px] text-muted-foreground px-1 py-2">
                {showArchived ? 'В архиве пусто' : 'Соберите файлы и переписку по теме в проект'}
              </div>
            )
          ) : (
            visible.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                  activeProjectId === project.id ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-secondary/50'
                }`}
              >
                <Icon name={project.icon || 'Folder'} size={13} className="shrink-0" fallback="Folder" />
                <span className="flex-1 min-w-0 truncate text-left">{project.name}</span>
                {project.filesCount > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{project.filesCount}</span>
                )}
              </button>
            ))
          )}

          {archived.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name={showArchived ? 'ArrowLeft' : 'Archive'} size={11} className="shrink-0" />
              {showArchived ? 'К активным проектам' : `В архиве: ${archived.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
