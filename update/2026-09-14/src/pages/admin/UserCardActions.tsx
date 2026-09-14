import Icon from '@/components/ui/icon';
import type { TeamUser } from './adminShared';

// UserCardActions — правая часть карточки участника: сессии, индивидуальные права, статистика,
// вход под участником, роль, видимость в команде, включение/отключение и скрытие.
// Разметка перенесена из UserList.tsx без изменений.
export default function UserCardActions({
  u,
  currentUserId,
  isRealAdmin,
  openSessions,
  permsForId,
  setPermsForId,
  openPerms,
  openStats,
  impersonate,
  impersonatingId,
  setRole,
  toggleShowInTeam,
  toggleActive,
  hideUser,
}: {
  u: TeamUser;
  currentUserId: number | undefined;
  isRealAdmin: boolean;
  openSessions: (u: TeamUser) => void;
  permsForId: number | null;
  setPermsForId: (id: number | null) => void;
  openPerms: (u: TeamUser) => void;
  openStats: (u: TeamUser) => void;
  impersonate: (u: TeamUser) => void;
  impersonatingId: number | null;
  setRole: (id: number, role: 'member' | 'admin') => void;
  toggleShowInTeam: (u: TeamUser) => void;
  toggleActive: (u: TeamUser) => void;
  hideUser: (u: TeamUser) => void;
}) {
  return (
    <>
      <button
        onClick={() => openSessions(u)}
        title="Сессии пользователя"
        className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Icon name="MonitorSmartphone" size={15} />
        {u.active_sessions > 0 && <span>{u.active_sessions}</span>}
      </button>

      {isRealAdmin && (
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
      )}

      <button
        onClick={() => openStats(u)}
        title="Статистика активности"
        className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Icon name="BarChart3" size={15} />
      </button>

      {/* impersonate/смена роли — только для настоящих администраторов (см. isRealAdmin
          выше): backend отклонит эти действия от участника с делегированным team_manage
          (403 admin_only_action, см. ADMIN_ONLY_ACTIONS в backend/admin/index.py). */}
      {isRealAdmin && u.is_active && u.id !== currentUserId && (
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

      {isRealAdmin ? (
        <select
          value={u.role}
          onChange={(e) => setRole(u.id, e.target.value as 'member' | 'admin')}
          disabled={u.id === currentUserId}
          className="rounded-lg border border-border bg-secondary/60 px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
        >
          <option value="member">Участник</option>
          <option value="admin">Администратор</option>
        </select>
      ) : (
        <span className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5 text-xs text-muted-foreground">
          {u.role === 'admin' ? 'Администратор' : 'Участник'}
        </span>
      )}

      <button
        onClick={() => toggleShowInTeam(u)}
        title={u.show_in_team ? 'Скрыть из списка команды' : 'Показывать в списке команды'}
        className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
          u.show_in_team ? 'text-muted-foreground hover:text-foreground hover:bg-secondary' : 'text-muted-foreground/40 hover:text-foreground hover:bg-secondary'
        }`}
      >
        <Icon name={u.show_in_team ? 'Eye' : 'EyeOff'} size={16} />
      </button>

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
    </>
  );
}
