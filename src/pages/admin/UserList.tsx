import Icon from '@/components/ui/icon';
import { PERMISSION_GROUPS } from './adminShared';
import type { TeamUser, Permissions } from './adminShared';

export default function UserList({
  users,
  loading,
  currentUserId,
  editSpecId,
  setEditSpecId,
  editSpecValue,
  setEditSpecValue,
  saveSpec,
  openSessions,
  permsForId,
  setPermsForId,
  openPerms,
  permsDraft,
  setPermsDraft,
  permsSaving,
  savePerms,
  openStats,
  setRole,
  toggleActive,
  hideUser,
  impersonate,
  impersonatingId,
}: {
  users: TeamUser[];
  loading: boolean;
  currentUserId: number | undefined;
  editSpecId: number | null;
  setEditSpecId: (id: number | null) => void;
  editSpecValue: string;
  setEditSpecValue: (v: string) => void;
  saveSpec: (id: number) => void;
  openSessions: (u: TeamUser) => void;
  permsForId: number | null;
  setPermsForId: (id: number | null) => void;
  openPerms: (u: TeamUser) => void;
  permsDraft: Permissions;
  setPermsDraft: React.Dispatch<React.SetStateAction<Permissions>>;
  permsSaving: boolean;
  savePerms: (id: number) => void;
  openStats: (u: TeamUser) => void;
  setRole: (id: number, role: 'member' | 'admin') => void;
  toggleActive: (u: TeamUser) => void;
  hideUser: (u: TeamUser) => void;
  impersonate: (u: TeamUser) => void;
  impersonatingId: number | null;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12"><Icon name="Loader2" size={24} className="animate-spin text-primary" /></div>
    );
  }

  return (
    <div className="space-y-2">
      {users.map((u) => {
        const pending = u.telegram_id <= 0;
        return (
          <div key={u.id}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="relative shrink-0">
              {u.photo_url ? (
                <img src={u.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-semibold">
                  {u.first_name.slice(0, 1)}
                </div>
              )}
              <span
                title={u.online ? 'Онлайн' : 'Оффлайн'}
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${u.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{u.first_name} {u.last_name ?? ''}</span>
                {pending && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">ожидает входа</span>}
                {!u.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">отключён</span>}
              </div>
              {editSpecId === u.id ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    value={editSpecValue}
                    onChange={(e) => setEditSpecValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveSpec(u.id); if (e.key === 'Escape') setEditSpecId(null); }}
                    autoFocus
                    placeholder="Список задач"
                    className="flex-1 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
                  />
                  <button onClick={() => saveSpec(u.id)} className="text-xs text-primary hover:underline">OK</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditSpecId(u.id); setEditSpecValue(u.specialization || ''); }}
                  className="text-xs text-muted-foreground hover:text-foreground text-left truncate block max-w-full"
                  title="Изменить список задач"
                >
                  {u.specialization || <span className="italic opacity-60">задать список задач…</span>}
                </button>
              )}
              {(u.tg_username || u.username) && (
                <a href={`https://t.me/${(u.tg_username || u.username || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  @{(u.tg_username || u.username || '').replace('@', '')}
                </a>
              )}
            </div>

            <button
              onClick={() => openSessions(u)}
              title="Сессии пользователя"
              className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon name="MonitorSmartphone" size={15} />
              {u.active_sessions > 0 && <span>{u.active_sessions}</span>}
            </button>

            <button
              onClick={() => (permsForId === u.id ? setPermsForId(null) : openPerms(u))}
              title="Индивидуальные права"
              className={`h-8 px-2 rounded-lg flex items-center gap-1 text-xs transition-colors ${
                permsForId === u.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon name="KeySquare" size={15} />
              <Icon name={permsForId === u.id ? 'ChevronUp' : 'ChevronDown'} size={12} />
            </button>

            <button
              onClick={() => openStats(u)}
              title="Статистика активности"
              className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon name="BarChart3" size={15} />
            </button>

            {u.is_active && u.id !== currentUserId && (
              <button
                onClick={() => impersonate(u)}
                disabled={impersonatingId !== null}
                title="Войти как этот участник"
                className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
              >
                {impersonatingId === u.id ? (
                  <Icon name="Loader2" size={15} className="animate-spin" />
                ) : (
                  <Icon name="LogIn" size={15} />
                )}
              </button>
            )}

            <select
              value={u.role}
              onChange={(e) => setRole(u.id, e.target.value as 'member' | 'admin')}
              disabled={u.id === currentUserId}
              className="rounded-lg border border-border bg-secondary/60 px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
            >
              <option value="member">Участник</option>
              <option value="admin">Администратор</option>
            </select>

            <button
              onClick={() => toggleActive(u)}
              disabled={u.id === currentUserId}
              title={u.is_active ? 'Отключить доступ' : 'Включить доступ'}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <Icon name={u.is_active ? 'UserX' : 'UserCheck'} size={16} />
            </button>

            {!u.is_active && u.id !== currentUserId && (
              <button
                onClick={() => hideUser(u)}
                title="Скрыть из команды"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </div>

          {permsForId === u.id && (
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          )}
          </div>
        );
      })}
    </div>
  );
}