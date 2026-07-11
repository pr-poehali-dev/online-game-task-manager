import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import type { PermissionKey } from '@/lib/auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import func2url from '../../backend/func2url.json';

// PERSISTENCE_MARKER_2024_PERM_CHECK — маркер проверки сохранения изменений
const ADMIN_URL = (func2url as Record<string, string>).admin;
const TOKEN_KEY = 'era_auth_token';

type Permissions = Partial<Record<PermissionKey, boolean>>;

interface PermissionGroup {
  title: string;
  icon: string;
  items: { key: PermissionKey; label: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Задачи',
    icon: 'ClipboardList',
    items: [
      { key: 'task_create', label: 'Создание задач' },
      { key: 'task_edit_own', label: 'Редактирование своих задач (созданных самим)' },
      { key: 'task_view_others', label: 'Просмотр чужих задач' },
      { key: 'task_restart', label: 'Перенос своих задач в «К рестарту»' },
    ],
  },
  {
    title: 'Идеи',
    icon: 'Lightbulb',
    items: [
      { key: 'idea_create', label: 'Создание идей' },
    ],
  },
  {
    title: 'База знаний',
    icon: 'BookOpen',
    items: [
      { key: 'kb_create', label: 'Создание статей' },
      { key: 'kb_edit', label: 'Редактирование статей' },
    ],
  },
  {
    title: 'Спринты',
    icon: 'Zap',
    items: [
      { key: 'sprint_create', label: 'Создание спринтов' },
      { key: 'sprint_edit', label: 'Редактирование спринтов' },
    ],
  },
];

interface TeamUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  member_id: string | null;
  tg_username: string | null;
  is_active: boolean;
  created_at: string | null;
  specialization: string | null;
  online: boolean;
  active_sessions: number;
  permissions: Permissions;
}

interface SessionInfo {
  id: number;
  created_at: string | null;
  expires_at: string | null;
  active: boolean;
}

interface UserStats {
  createdCount: number;
  closedCount: number;
  receivedCount: number;
  timeSpentSeconds: number;
}

function fmtDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return '< 1 мин';
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  return parts.join(' ');
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function authFetch(body: object) {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return fetch(ADMIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: JSON.stringify(body),
  });
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteSpec, setInviteSpec] = useState('');
  const [inviting, setInviting] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<TeamUser | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [editSpecId, setEditSpecId] = useState<number | null>(null);
  const [editSpecValue, setEditSpecValue] = useState('');
  const [permsForId, setPermsForId] = useState<number | null>(null);
  const [permsDraft, setPermsDraft] = useState<Permissions>({});
  const [permsSaving, setPermsSaving] = useState(false);
  const [statsFor, setStatsFor] = useState<TeamUser | null>(null);
  const [statsRange, setStatsRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from, to };
  });
  const [statsCalendarOpen, setStatsCalendarOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const res = await fetch(ADMIN_URL, { method: 'GET', headers: { 'X-Auth-Token': token } });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    const name = inviteName.trim().replace('@', '');
    if (!name) return;
    setInviting(true);
    const res = await authFetch({ action: 'invite', tg_username: name, role: inviteRole, specialization: inviteSpec.trim() });
    setInviting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'already_exists') { alert('Такой участник уже есть в команде.'); return; }
      alert('Не удалось пригласить. Попробуйте ещё раз.');
      return;
    }
    setInviteName('');
    setInviteRole('member');
    setInviteSpec('');
    load();
  }

  async function saveSpec(id: number) {
    await authFetch({ action: 'set_specialization', user_id: id, specialization: editSpecValue.trim() });
    setEditSpecId(null);
    setEditSpecValue('');
    load();
  }

  async function openSessions(u: TeamUser) {
    setSessionsFor(u);
    setSessionsLoading(true);
    setSessions([]);
    const res = await authFetch({ action: 'sessions', user_id: u.id });
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
    setSessionsLoading(false);
  }

  async function setRole(id: number, role: 'member' | 'admin') {
    await authFetch({ action: 'set_role', user_id: id, role });
    load();
  }

  async function toggleActive(u: TeamUser) {
    await authFetch({ action: 'set_active', user_id: u.id, is_active: !u.is_active });
    load();
  }

  async function hideUser(u: TeamUser) {
    if (!confirm(`Скрыть ${u.first_name} из команды? Аккаунт будет отключён и убран из списка.`)) return;
    await authFetch({ action: 'set_hidden', user_id: u.id, is_hidden: true });
    load();
  }

  function openPerms(u: TeamUser) {
    setPermsForId(u.id);
    setPermsDraft({ ...u.permissions });
  }

  async function savePerms(id: number) {
    setPermsSaving(true);
    await authFetch({ action: 'set_permissions', user_id: id, permissions: permsDraft });
    setPermsSaving(false);
    setPermsForId(null);
    load();
  }

  const loadStats = useCallback(async (userId: number, range: DateRange | undefined) => {
    if (!range?.from) return;
    setStatsLoading(true);
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = range.to ? new Date(range.to) : new Date(range.from);
    to.setHours(23, 59, 59, 999);
    const res = await authFetch({ action: 'stats', user_id: userId, from: from.toISOString(), to: to.toISOString() });
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    } else {
      setStats(null);
    }
    setStatsLoading(false);
  }, []);

  function openStats(u: TeamUser) {
    setStatsFor(u);
    setStats(null);
    loadStats(u.id, statsRange);
  }

  function applyStatsRange(range: DateRange | undefined) {
    setStatsRange(range);
    if (statsFor && range?.from && range?.to) {
      setStatsCalendarOpen(false);
      loadStats(statsFor.id, range);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center gap-4 px-6 bg-card/40">
        <span className="font-display tracking-widest text-base" style={{ letterSpacing: '0.12em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Icon name="Shield" size={14} /> Админка</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 h-8 px-3 rounded-lg bg-secondary/60 text-sm hover:bg-secondary transition-colors">
            <Icon name="LayoutGrid" size={15} /> Доска
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Icon name="LogOut" size={15} /> Выйти
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-1">Управление командой</h1>
        <p className="text-sm text-muted-foreground mb-6">Выдавайте доступ и назначайте администраторов. Приглашённый войдёт через Telegram.</p>

        {/* Invite */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6">
          <label className="block text-xs text-muted-foreground mb-2">Пригласить участника: роль, список задач и Telegram @username</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center sm:w-52 rounded-lg border border-border bg-secondary/60 px-3">
              <span className="text-muted-foreground text-sm">@</span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && invite()}
                placeholder="username"
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
              className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="member">Участник</option>
              <option value="admin">Администратор</option>
            </select>
            <input
              value={inviteSpec}
              onChange={(e) => setInviteSpec(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
              placeholder="Список задач (напр. Соцсети · Баннеры)"
              className="flex-1 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm focus:outline-none"
            />
            <button
              onClick={invite}
              disabled={inviting || !inviteName.trim()}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2 justify-center shrink-0"
            >
              <Icon name="UserPlus" size={15} /> Пригласить
            </button>
          </div>
        </div>

        {/* Users list */}
        {loading ? (
          <div className="flex justify-center py-12"><Icon name="Loader2" size={24} className="animate-spin text-primary" /></div>
        ) : (
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

                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.id, e.target.value as 'member' | 'admin')}
                    disabled={u.id === user?.id}
                    className="rounded-lg border border-border bg-secondary/60 px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                  >
                    <option value="member">Участник</option>
                    <option value="admin">Администратор</option>
                  </select>

                  <button
                    onClick={() => toggleActive(u)}
                    disabled={u.id === user?.id}
                    title={u.is_active ? 'Отключить доступ' : 'Включить доступ'}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30"
                  >
                    <Icon name={u.is_active ? 'UserX' : 'UserCheck'} size={16} />
                  </button>

                  {!u.is_active && u.id !== user?.id && (
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
        )}
      </main>

      {sessionsFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSessionsFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Сессии — {sessionsFor.first_name}</h2>
                <p className="text-xs text-muted-foreground">Устройства и входы пользователя</p>
              </div>
              <button onClick={() => setSessionsFor(null)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
                <Icon name="X" size={18} />
              </button>
            </div>

            {sessionsLoading ? (
              <div className="flex justify-center py-8"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Сессий нет</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${s.active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-medium">{s.active ? 'Активна' : 'Завершена'}</div>
                      <div className="text-muted-foreground">
                        Вход: {s.created_at ? new Date(s.created_at).toLocaleString('ru-RU') : '—'}
                      </div>
                      <div className="text-muted-foreground">
                        {s.active ? 'Истекает' : 'Истекла'}: {s.expires_at ? new Date(s.expires_at).toLocaleString('ru-RU') : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {statsFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setStatsFor(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Статистика — {statsFor.first_name}</h2>
                <p className="text-xs text-muted-foreground">Активность за выбранный период</p>
              </div>
              <button onClick={() => setStatsFor(null)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
                <Icon name="X" size={18} />
              </button>
            </div>

            <Popover open={statsCalendarOpen} onOpenChange={setStatsCalendarOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm hover:bg-secondary transition-colors mb-4">
                  <Icon name="Calendar" size={15} className="text-muted-foreground" />
                  {statsRange?.from
                    ? statsRange.to
                      ? `${fmtDay(statsRange.from)} — ${fmtDay(statsRange.to)}`
                      : fmtDay(statsRange.from)
                    : 'Выберите период'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={statsRange}
                  onSelect={applyStatsRange}
                  numberOfMonths={2}
                  defaultMonth={statsRange?.from}
                />
              </PopoverContent>
            </Popover>

            {statsLoading ? (
              <div className="flex justify-center py-10"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Icon name="PlusCircle" size={13} />
                    Создал задач
                  </div>
                  <div className="text-2xl font-semibold">{stats.createdCount}</div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Icon name="CheckCircle2" size={13} />
                    Закрыл задач
                  </div>
                  <div className="text-2xl font-semibold">{stats.closedCount}</div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Icon name="Inbox" size={13} />
                    Получил задач
                  </div>
                  <div className="text-2xl font-semibold">{stats.receivedCount}</div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Icon name="Clock" size={13} />
                    Время в приложении
                  </div>
                  <div className="text-2xl font-semibold">{fmtDuration(stats.timeSpentSeconds)}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">Не удалось загрузить статистику</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}