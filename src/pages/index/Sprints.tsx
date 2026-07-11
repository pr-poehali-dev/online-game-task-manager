import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Task, Sprint } from './shared';
import type { PermissionKey } from '@/lib/auth';
import SprintCard from './SprintCard';
import { SprintEditModal } from './SprintModals';

export default function Sprints({ sprints, tasks, onUpdate, onDelete, onFilterBoard, isAdmin, can }: {
  sprints: Sprint[];
  tasks: Task[];
  onUpdate: (s: Sprint) => void;
  onDelete: (id: string) => void;
  onFilterBoard: (sprintId: string) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
}) {
  const [editing, setEditing] = useState<Sprint | null>(null);

  const activeSprints = sprints.filter((s) => s.status !== 'done');

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
            isAdmin={isAdmin}
            can={can}
          />
        ))}

        {activeSprints.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Активных спринтов нет — создай новый
          </div>
        )}
      </div>

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