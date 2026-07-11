import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Task, Sprint } from './shared';
import SprintCard from './SprintCard';
import { SprintEditModal } from './SprintModals';

export default function Sprints({ sprints, tasks, onUpdate, onDelete, onFilterBoard }: {
  sprints: Sprint[];
  tasks: Task[];
  onUpdate: (s: Sprint) => void;
  onDelete: (id: string) => void;
  onFilterBoard: (sprintId: string) => void;
}) {
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const activeSprints = sprints.filter((s) => s.status !== 'done');
  const archivedSprints = sprints.filter((s) => s.status === 'done');

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Icon name="Zap" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Спринты</h2>
        <span className="text-sm text-muted-foreground">· {activeSprints.length} активных</span>
      </div>

      <div className="space-y-4">
        {activeSprints.map((sp, i) => (
          <SprintCard
            key={sp.id}
            sprint={sp}
            index={i}
            tasks={tasks}
            onFilterBoard={onFilterBoard}
            onEdit={setEditing}
            onDelete={onDelete}
          />
        ))}

        {activeSprints.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Активных спринтов нет — создай новый
          </div>
        )}
      </div>

      {archivedSprints.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <Icon name={showArchive ? 'ChevronDown' : 'ChevronRight'} size={16} />
            <Icon name="Archive" size={15} />
            Архив спринтов
            <span className="text-xs font-mono opacity-60">{archivedSprints.length}</span>
          </button>
          {showArchive && (
            <div className="space-y-4 opacity-80">
              {archivedSprints.map((sp, i) => (
                <SprintCard
                  key={sp.id}
                  sprint={sp}
                  index={i}
                  tasks={tasks}
                  onFilterBoard={onFilterBoard}
                  onEdit={setEditing}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <SprintEditModal
          sprint={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { onUpdate(updated); setEditing(null); }}
        />
      )}
    </div>
  );
}
