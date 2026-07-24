import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import AttachmentsField, { AttachmentsList } from '@/components/AttachmentsField';
import type { Task, TeamMember, Attachment } from './shared';
import { columns, deployStatuses, DeployBadge, TASKS_URL, authHeaders, needsLauncherUpload, LauncherBadge, inputCls } from './shared';
import { PrivateNoteComposer, PrivateNotesList } from './TaskModalShared';
import type { PrivateNote } from './usePrivateNotes';

export default function TaskModalDetails({
  task,
  form,
  setForm,
  team,
  isEditing,
  canFullEdit,
  canEditDeploy,
  isAdmin,
  currentUserId,
  privateNotes,
  addPrivateNote,
  removePrivateNote,
  uploadImage,
  attachments,
  setAttachments,
  onOpenPatches,
  hasPatchFiles,
  onSetLauncherUploaded,
  deployOpen,
  setDeployOpen,
  changeDeployStatus,
  links,
  newLink,
  setNewLink,
  addLink,
  removeLink,
}: {
  task: Task;
  form: Task;
  setForm: (updater: (p: Task) => Task) => void;
  team: TeamMember[];
  isEditing: boolean;
  canFullEdit: boolean;
  canEditDeploy: boolean;
  isAdmin: boolean;
  currentUserId: number | null;
  privateNotes: PrivateNote[];
  addPrivateNote: (targetUserId: number, text: string, commentId?: string | null) => Promise<boolean>;
  removePrivateNote: (id: string) => void;
  uploadImage: (file: File) => Promise<string>;
  attachments: Attachment[];
  setAttachments: (updater: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void;
  onOpenPatches?: () => void;
  hasPatchFiles?: boolean;
  onSetLauncherUploaded?: (id: string, uploaded: boolean) => void;
  deployOpen: boolean;
  setDeployOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  changeDeployStatus: (ds: (typeof deployStatuses)[number]) => void;
  links: { url: string; label: string }[];
  newLink: { url: string; label: string };
  setNewLink: (updater: (p: { url: string; label: string }) => { url: string; label: string }) => void;
  addLink: () => void;
  removeLink: (i: number) => void;
}) {
  return (
    <>
      {/* Description */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-1">Описание</label>
        {isEditing && canFullEdit ? (
          <>
            <RichEditor
              content={form.description ?? ''}
              onChange={(html) => setForm((p) => ({ ...p, description: html }))}
              onImageUpload={uploadImage}
              large
              toolbarExtra={<PrivateNoteComposer variant="icon" align="right" team={team} currentUserId={currentUserId} onAdd={(uid, text) => addPrivateNote(uid, text)} />}
            />
            <div className="mt-2">
              <PrivateNotesList notes={privateNotes} team={team} currentUserId={currentUserId} isAdmin={isAdmin} onRemove={removePrivateNote} editable />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3 max-h-[32rem] overflow-y-auto scrollbar-thin space-y-2">
            <div
              className="kb-content"
              dangerouslySetInnerHTML={{ __html: form.description || '<p class="text-muted-foreground">Без описания</p>' }}
            />
            <PrivateNotesList notes={privateNotes} team={team} currentUserId={currentUserId} isAdmin={isAdmin} onRemove={removePrivateNote} editable={false} />
          </div>
        )}
      </div>

      {((isEditing && canFullEdit) || attachments.length > 0) && (
        /* Attachments — видно всем, у кого открыта задача; редактирование только при полном доступе и в режиме редактирования */
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Вложения</label>
          {isEditing && canFullEdit ? (
            <AttachmentsField attachments={attachments} onChange={setAttachments} uploadUrl={TASKS_URL} authHeaders={authHeaders} />
          ) : (
            <AttachmentsList attachments={attachments} />
          )}
        </div>
      )}

      {!isEditing && onOpenPatches && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPatches}
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors w-fit ${
              hasPatchFiles
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            <Icon name="FolderTree" size={14} />
            Показать файлы патча этой задачи
          </button>
          {needsLauncherUpload(task, !!hasPatchFiles) && <LauncherBadge uploaded={false} />}
          {hasPatchFiles && task.launcherUploaded && <LauncherBadge uploaded />}
          {hasPatchFiles && canEditDeploy && onSetLauncherUploaded && (
            <button
              type="button"
              onClick={() => onSetLauncherUploaded(task.id, !task.launcherUploaded)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors w-fit"
            >
              <Icon name={task.launcherUploaded ? 'RotateCcw' : 'CheckCircle2'} size={14} />
              {task.launcherUploaded ? 'Снять отметку загрузки' : 'Отметить как загружено в лаунчер'}
            </button>
          )}
        </div>
      )}

      {!isEditing && canEditDeploy && (
        /* Deploy status — быстрая смена статуса прямо со страницы просмотра, сохраняется сразу без входа в режим редактирования */
        <div>
          <button
            type="button"
            onClick={() => setDeployOpen((v) => !v)}
            className="flex items-center gap-2"
          >
            <Icon name="ChevronRight" size={14} className={`text-muted-foreground transition-transform ${deployOpen ? 'rotate-90' : ''}`} />
            <span className="text-xs text-muted-foreground">Статус деплоя</span>
            {(form.deployStatus ?? 'none') !== 'none' && (
              <DeployBadge status={form.deployStatus ?? 'none'} />
            )}
          </button>
          {deployOpen && (
            <div className="space-y-3 animate-scale-in mt-2">
              {columns.map((col) => (
                <div key={col.id}>
                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Icon name={col.icon} size={11} />
                    {col.title}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {deployStatuses.filter((ds) => ds.column === col.id).map((ds) => {
                      const active = (form.deployStatus ?? 'none') === ds.id;
                      return (
                        <button
                          key={ds.id}
                          onClick={() => changeDeployStatus(ds)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all"
                          style={{
                            background: active ? `hsl(${ds.color} / 0.18)` : 'transparent',
                            borderColor: active ? `hsl(${ds.color} / 0.5)` : 'hsl(var(--border))',
                            color: active ? `hsl(${ds.color})` : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          <Icon name={ds.icon} size={12} />
                          {ds.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {((isEditing && canFullEdit) || links.length > 0) && (
        /* Links — видно всем, у кого открыта задача; редактирование только при полном доступе и в режиме редактирования */
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Ссылки</label>
          {links.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 group">
                  <Icon name="Link" size={13} className="text-primary shrink-0" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                    {l.label}
                  </a>
                  {isEditing && canFullEdit && (
                    <button onClick={() => removeLink(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                      <Icon name="X" size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isEditing && canFullEdit && (
            <div className="flex gap-2">
              <input
                value={newLink.label}
                onChange={(e) => setNewLink((p) => ({ ...p, label: e.target.value }))}
                placeholder="Название (напр. Тикет #1234)"
                className={inputCls + ' flex-1'}
              />
              <input
                value={newLink.url}
                onChange={(e) => setNewLink((p) => ({ ...p, url: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
                placeholder="https://..."
                className={inputCls + ' flex-1'}
              />
              <button
                onClick={addLink}
                className="h-9 px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
              >
                <Icon name="Plus" size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}