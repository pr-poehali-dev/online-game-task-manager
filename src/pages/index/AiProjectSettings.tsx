import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { AiProject, AiProjectsState } from './useAiProjects';

// Набор иконок для проекта — небольшой понятный список вместо полного каталога lucide.
const ICONS = ['Folder', 'Briefcase', 'Rocket', 'Code2', 'FileText', 'ChartBar', 'Wrench', 'Lightbulb'];

// AiProjectSettings — вкладка «Настройки» проекта: имя, иконка, архивация и удаление.
// Удаление намеренно предлагает два варианта, потому что это единственное необратимое действие:
// по умолчанию содержимое сохраняется в личном хранилище, стереть вместе с файлами нужно выбрать
// осознанно.
export default function AiProjectSettings({ state, project }: { state: AiProjectsState; project: AiProject }) {
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <div className="text-xs font-medium mb-1.5">Название</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== project.name) state.updateProject(project.id, { name: name.trim() }); }}
          className="w-full h-9 rounded-lg border border-border bg-secondary/40 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <div className="text-xs font-medium mb-1.5">Иконка</div>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => state.updateProject(project.id, { icon })}
              className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-colors ${
                project.icon === icon
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Icon name={icon} size={15} fallback="Folder" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3 pt-1">
        <button
          onClick={() => state.updateProject(project.id, { archived: !project.archived })}
          className="h-9 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
        >
          <Icon name={project.archived ? 'ArchiveRestore' : 'Archive'} size={13} />
          {project.archived ? 'Вернуть из архива' : 'В архив'}
        </button>
        <div className="text-[11px] text-muted-foreground pt-2">
          Архивные проекты не занимают место в лимите проектов
        </div>
      </div>

      <div className="pt-4 border-t border-border space-y-2">
        <div className="text-xs font-medium text-destructive">Удаление проекта</div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="h-9 px-3 rounded-lg border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
          >
            <Icon name="Trash2" size={13} />
            Удалить проект
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => state.deleteProject(project.id, false)}
              className="w-full h-9 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50 transition-colors text-left"
            >
              Удалить только проект — файлы и сессии останутся в «Моих файлах»
            </button>
            <button
              onClick={() => state.deleteProject(project.id, true)}
              className="w-full h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs hover:opacity-90 transition-opacity text-left"
            >
              Удалить вместе с файлами и сессиями — безвозвратно
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
