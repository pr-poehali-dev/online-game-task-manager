import { useState } from 'react';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Task, TeamMember, TaskOutcome, Sprint, Attachment } from './shared';
import { taskAssigneeIds, deployStatuses, ModalOverlay, mskLocalToIso, isoToMskLocal, TASKS_URL, authHeaders } from './shared';
import TaskModalHeader from './TaskModalHeader';
import TaskModalMeta from './TaskModalMeta';
import TaskModalDetails from './TaskModalDetails';
import TaskComments from './TaskComments';
import usePrivateNotes from './usePrivateNotes';
import type { PermissionKey } from '@/lib/auth';

export default function TaskModal({ task, team, kbArticles, onOpenArticle, onClose, onSave, onDelete, onArchive, onUnarchive, sprints, isAdmin, can, currentUserId, onOpenPatches, hasPatchFiles, onSetLauncherUploaded }: {
  task: Task;
  team: TeamMember[];
  kbArticles: KbArticleBrief[];
  onOpenArticle: (id: string) => void;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, outcome: TaskOutcome) => void;
  onUnarchive: (id: string) => void;
  sprints: Sprint[];
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
  onOpenPatches?: () => void;
  hasPatchFiles?: boolean;
  onSetLauncherUploaded?: (id: string, uploaded: boolean) => void;
}) {
  const [form, setForm] = useState<Task>({ ...task });
  const [links, setLinks] = useState<{ url: string; label: string }[]>(task.links ?? []);
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments ?? []);
  const [deadlineLocal, setDeadlineLocal] = useState(isoToMskLocal(task.deadline));
  const [archiveMenu, setArchiveMenu] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const isCreator = task.creatorId != null && task.creatorId === currentUserId;
  const isAssignee = currentUserId != null && taskAssigneeIds(task).includes(currentUserId);
  const canFullEdit = isAdmin || (can('task_edit_own') && isCreator);
  // Статус деплоя может менять автор задачи или назначенный исполнитель — даже без полного доступа
  const canEditDeploy = canFullEdit || isCreator || isAssignee;
  // Режим просмотра по умолчанию: чистое описание + прикреплённая информация, без полей редактирования.
  // Доступен переход в редактирование только если есть на это право (полное или хотя бы статус деплоя).
  const [editing, setEditing] = useState(false);
  const isEditing = editing && (canFullEdit || canEditDeploy);
  const set = (k: keyof Task, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setAssignees = (ids: number[]) => setForm((p) => ({ ...p, assigneeIds: ids, assigneeId: ids[0] ?? null }));
  const setKbIds = (ids: number[]) => setForm((p) => ({ ...p, kbArticleIds: ids }));
  const { notes: privateNotes, addNote: addPrivateNote, removeNote: removePrivateNote } = usePrivateNotes(task.id);

  function addLink() {
    if (!newLink.url.trim()) return;
    const updated = [...links, { url: newLink.url, label: newLink.label || newLink.url }];
    setLinks(updated);
    setNewLink({ url: '', label: '' });
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadImage(file: File): Promise<string> {
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const res = await fetch(TASKS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'upload_image', data: dataUrl, ext, contentType: file.type }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.url || '';
  }

  function changeDeployStatus(ds: (typeof deployStatuses)[number]) {
    // Быстрая смена статуса деплоя прямо со страницы просмотра, без входа в режим редактирования
    const updated = { ...task, column: ds.column, deployStatus: ds.id };
    setForm(updated);
    setDeployOpen(false);
    onSave(updated);
  }

  function cancelEdit() {
    setForm({ ...task });
    setLinks(task.links ?? []);
    setAttachments(task.attachments ?? []);
    setDeadlineLocal(isoToMskLocal(task.deadline));
    setEditing(false);
  }

  function handleSave() {
    if (!canFullEdit) {
      if (canEditDeploy) {
        // Без полного доступа автор/исполнитель может менять статус деплоя (и связанную с ним колонку)
        onSave({ ...task, column: form.column, deployStatus: form.deployStatus });
        setEditing(false);
        return;
      }
      // Без права полного редактирования — можно изменить только колонку (перенос по доске To Do / In Progress / Done)
      onSave({ ...task, column: form.column });
      setEditing(false);
      return;
    }
    onSave({ ...form, links, attachments, deadline: deadlineLocal ? mskLocalToIso(deadlineLocal) : null });
    setEditing(false);
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      <TaskModalHeader
        task={task}
        form={form}
        isEditing={isEditing}
        canFullEdit={canFullEdit}
        canEditDeploy={canEditDeploy}
        isAdmin={isAdmin}
        archiveMenu={archiveMenu}
        setArchiveMenu={setArchiveMenu}
        onClose={onClose}
        onDelete={onDelete}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onStartEdit={() => setEditing(true)}
      />

      <div className="px-6 py-5 space-y-4">
        <TaskModalMeta
          task={task}
          form={form}
          set={set}
          team={team}
          kbArticles={kbArticles}
          onOpenArticle={onOpenArticle}
          sprints={sprints}
          isEditing={isEditing}
          canFullEdit={canFullEdit}
          canEditDeploy={canEditDeploy}
          setAssignees={setAssignees}
          setKbIds={setKbIds}
          deadlineLocal={deadlineLocal}
          setDeadlineLocal={setDeadlineLocal}
        />

        <TaskModalDetails
          task={task}
          form={form}
          setForm={setForm}
          team={team}
          isEditing={isEditing}
          canFullEdit={canFullEdit}
          canEditDeploy={canEditDeploy}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          privateNotes={privateNotes}
          addPrivateNote={addPrivateNote}
          removePrivateNote={removePrivateNote}
          uploadImage={uploadImage}
          attachments={attachments}
          setAttachments={setAttachments}
          onOpenPatches={onOpenPatches}
          hasPatchFiles={hasPatchFiles}
          onSetLauncherUploaded={onSetLauncherUploaded}
          deployOpen={deployOpen}
          setDeployOpen={setDeployOpen}
          changeDeployStatus={changeDeployStatus}
          links={links}
          newLink={newLink}
          setNewLink={setNewLink}
          addLink={addLink}
          removeLink={removeLink}
        />

        {/* Comments — только в режиме просмотра, не отвлекают во время редактирования задачи */}
        {!isEditing && <TaskComments taskId={task.id} team={team} />}
      </div>

      {/* Footer — кнопки сохранения/отмены видны только в режиме редактирования */}
      {isEditing && (
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={cancelEdit}
            className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Сохранить
          </button>
        </div>
      )}
    </ModalOverlay>
  );
}
