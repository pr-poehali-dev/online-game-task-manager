import Icon from '@/components/ui/icon';
import { PERMISSION_GROUPS, OWNER_ONLY_PERMISSION_GROUPS, PATCH_SUB_PERMISSION_GROUP } from './adminShared';
import type { TeamUser, Permissions } from './adminShared';

// UserPermissionsPanel — раскрывающаяся панель индивидуальных прав участника: обычные права,
// особые права руководителя (с вложенными доп. правами патчей) и настройки Telegram.
// Разметка перенесена из UserList.tsx без изменений.
export default function UserPermissionsPanel({
  u,
  permsDraft,
  setPermsDraft,
  permsSaving,
  permsError,
  savePerms,
  setPermsForId,
  isOwner,
  toggleTgMuted,
  toggleShowTgContact,
}: {
  u: TeamUser;
  permsDraft: Permissions;
  setPermsDraft: React.Dispatch<React.SetStateAction<Permissions>>;
  permsSaving: boolean;
  permsError: string;
  savePerms: (id: number) => void;
  setPermsForId: (id: number | null) => void;
  isOwner: boolean;
  toggleTgMuted: (u: TeamUser) => void;
  toggleShowTgContact: (u: TeamUser) => void;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-border bg-card/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Индивидуальные права — приоритетнее роли «{u.role === 'admin' ? 'Администратор' : 'Участник'}».
          Не отмеченные права наследуются от роли по умолчанию.
        </p>
        <button
          onClick={() => setPermsForId(null)}
          className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="X" size={14} />
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Обычные права
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-foreground">
                  <Icon name={group.icon} size={13} className="text-primary" />
                  {group.title}
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!permsDraft[item.key]}
                        onChange={(e) =>
                          setPermsDraft((prev) => ({ ...prev, [item.key]: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OWNER_ONLY_PERMISSION_GROUPS (сейчас — просмотр чужих приватных сообщений,
            редактирование патчей) — выдавать/отзывать может только владелец проекта
            (backend/admin/index.py, OWNER_USER_ID). Не-владельцу показываем те же
            чекбоксы, но заблокированными (disabled) с пояснением — честнее, чем скрыть
            совсем (видно, что право есть и кем управляется), и не даёт заполнить форму,
            которую backend всё равно отклонит только при сохранении.
            patch_launcher_upload/patch_delete_files (PATCH_SUB_PERMISSION_GROUP) —
            донастройка ПОВЕРХ patch_edit, которую уже может выдать любой администратор —
            вложена ОТСТУПОМ прямо под карточку "Патчи", чтобы визуально показать
            зависимость, а не разбрасывать по отдельным одинаковым карточкам. */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Icon name="Crown" size={11} className="text-amber-500" />
            Особые права руководителя
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OWNER_ONLY_PERMISSION_GROUPS.map((group) => {
              const isPatchGroup = group.title === 'Патчи';
              const patchEditOn = !!permsDraft.patch_edit;
              return (
                <div key={group.title} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-foreground">
                    <Icon name={group.icon} size={13} className="text-amber-500" />
                    {group.title}
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto flex items-center gap-1">
                      <Icon name="Lock" size={10} />
                      только руководитель
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center gap-2 text-xs text-muted-foreground ${isOwner ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!!permsDraft[item.key]}
                          disabled={!isOwner}
                          onChange={(e) =>
                            setPermsDraft((prev) => ({ ...prev, [item.key]: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                  {isPatchGroup && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-500/20">
                      <div className="text-[10px] text-muted-foreground mb-1.5">
                        Доп. права — доступны любому администратору, если включено выше
                      </div>
                      <div className="pl-3 border-l-2 border-amber-500/20 space-y-1.5">
                        {PATCH_SUB_PERMISSION_GROUP.items.map((item) => (
                          <label
                            key={item.key}
                            className={`flex items-center gap-2 text-xs text-muted-foreground ${patchEditOn ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                          >
                            <input
                              type="checkbox"
                              checked={!!permsDraft[item.key]}
                              disabled={!patchEditOn}
                              onChange={(e) =>
                                setPermsDraft((prev) => ({ ...prev, [item.key]: e.target.checked }))
                              }
                              className="h-3.5 w-3.5 rounded border-border accent-primary"
                            />
                            {item.label.replace(/\s*\(требует.*\)$/, '')}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Telegram
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={u.tg_notify_muted}
                  onChange={() => toggleTgMuted(u)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                Скрыть написание в Telegram (бот не будет присылать сообщения этому участнику)
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={!u.show_tg_contact}
                  onChange={() => toggleShowTgContact(u)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                Скрыть кнопку «написать в Telegram» в списке команды
              </label>
            </div>
          </div>
        </div>
      </div>

      {permsError && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} />
          {permsError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setPermsForId(null)}
          className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={() => savePerms(u.id)}
          disabled={permsSaving}
          className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
