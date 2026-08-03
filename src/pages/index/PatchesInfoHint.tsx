import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
export default function InfoHint({
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
