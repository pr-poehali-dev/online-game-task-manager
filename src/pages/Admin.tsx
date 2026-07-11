import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import type { DateRange } from 'react-day-picker';
import InviteForm from './admin/InviteForm';
import UserList from './admin/UserList';
import SessionsModal from './admin/SessionsModal';
import StatsModal from './admin/StatsModal';
import { ADMIN_URL, TOKEN_KEY, authFetch } from './admin/adminShared';
import type { TeamUser, SessionInfo, UserStats, Permissions } from './admin/adminShared';
import ThemeToggle from '@/components/ThemeToggle';

export default function Admin() {
  const navigate = useNavigate();
  const { user, logout, applySession } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
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

  async function impersonate(u: TeamUser) {
    setImpersonatingId(u.id);
    try {
      const res = await authFetch({ action: 'impersonate', user_id: u.id });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        alert('Не удалось войти под этим участником.');
        return;
      }
      applySession(data.token, data.user);
      navigate(data.user.role === 'admin' ? '/admin' : '/cabinet', { replace: true });
    } finally {
      setImpersonatingId(null);
    }
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
          <ThemeToggle />
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

        <InviteForm
          inviteName={inviteName}
          setInviteName={setInviteName}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          inviteSpec={inviteSpec}
          setInviteSpec={setInviteSpec}
          inviting={inviting}
          onInvite={invite}
        />

        <UserList
          users={users}
          loading={loading}
          currentUserId={user?.id}
          editSpecId={editSpecId}
          setEditSpecId={setEditSpecId}
          editSpecValue={editSpecValue}
          setEditSpecValue={setEditSpecValue}
          saveSpec={saveSpec}
          openSessions={openSessions}
          permsForId={permsForId}
          setPermsForId={setPermsForId}
          openPerms={openPerms}
          permsDraft={permsDraft}
          setPermsDraft={setPermsDraft}
          permsSaving={permsSaving}
          savePerms={savePerms}
          openStats={openStats}
          setRole={setRole}
          toggleActive={toggleActive}
          hideUser={hideUser}
          impersonate={impersonate}
          impersonatingId={impersonatingId}
        />
      </main>

      {sessionsFor && (
        <SessionsModal
          sessionsFor={sessionsFor}
          onClose={() => setSessionsFor(null)}
          sessionsLoading={sessionsLoading}
          sessions={sessions}
        />
      )}

      {statsFor && (
        <StatsModal
          statsFor={statsFor}
          onClose={() => setStatsFor(null)}
          statsCalendarOpen={statsCalendarOpen}
          setStatsCalendarOpen={setStatsCalendarOpen}
          statsRange={statsRange}
          applyStatsRange={applyStatsRange}
          statsLoading={statsLoading}
          stats={stats}
        />
      )}
    </div>
  );
}