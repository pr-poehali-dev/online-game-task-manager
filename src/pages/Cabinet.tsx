import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import type { DateRange } from 'react-day-picker';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import ThemeToggle from '@/components/ThemeToggle';
import Faq from '@/components/Faq';
import InviteForm from './admin/InviteForm';
import UserList from './admin/UserList';
import SessionsModal from './admin/SessionsModal';
import StatsModal from './admin/StatsModal';
import FilesList from './admin/FilesList';
import ActivityLogList from './admin/ActivityLogList';
import { ADMIN_URL, TOKEN_KEY, authFetch } from './admin/adminShared';
import type { TeamUser, SessionInfo, UserStats, Permissions, FilesBySection, ActivityEntry } from './admin/adminShared';
import CabinetSidebar, { SidebarContent, cabinetSectionLabel } from './cabinet/CabinetSidebar';
import type { CabinetSection } from './cabinet/CabinetSidebar';
import CabinetProfile from './cabinet/CabinetProfile';
import CabinetProject from './cabinet/CabinetProject';
import CabinetStats from './cabinet/CabinetStats';

export default function Cabinet() {
  const navigate = useNavigate();
  const { user, isAdmin, logout, applySession } = useAuth();
  const [section, setSection] = useState<CabinetSection>('profile');
  const [menuOpen, setMenuOpen] = useState(false);

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  // isOwner/isRealAdmin приходят с backend (единый источник истины, см. backend/admin/index.py):
  // isOwner — управляет выдачей/отзывом OWNER_ONLY_PERMISSION_GROUPS (просмотр чужих приватных
  // сообщений, редактирование патчей), isRealAdmin — true только для настоящей роли admin (не для
  // участника с делегированным точечным правом team_manage) — управляет видимостью действий,
  // которые backend разрешает исключительно администраторам (impersonate/смена роли/индивидуальные
  // права, см. ADMIN_ONLY_ACTIONS).
  const [isOwner, setIsOwner] = useState(false);
  const [isRealAdmin, setIsRealAdmin] = useState(false);
  const [hasTeamAccess, setHasTeamAccess] = useState(false);
  const [permsError, setPermsError] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteSpec, setInviteSpec] = useState('');
  const [inviting, setInviting] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<TeamUser | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [editSpecId, setEditSpecId] = useState<number | null>(null);
  const [editSpecValue, setEditSpecValue] = useState('');
  const [editNameId, setEditNameId] = useState<number | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
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
  const [filesLoading, setFilesLoading] = useState(false);
  const [files, setFiles] = useState<FilesBySection | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityUserFilter, setActivityUserFilter] = useState<number | 'all'>('all');
  const [activityRange, setActivityRange] = useState<DateRange | undefined>(undefined);

  const load = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const res = await fetch(ADMIN_URL, { method: 'GET', headers: { 'X-Auth-Token': token } });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setIsOwner(!!data.isOwner);
      setIsRealAdmin(!!data.isRealAdmin);
      setHasTeamAccess(true);
    } else {
      // 403 forbidden — участник без team_manage/admin, разделы Команда/Журнал/Хранилище ему не
      // видны в сайдбаре (см. CabinetSidebar), список пользователей не нужен вовсе.
      setHasTeamAccess(false);
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => { if (user) load(); }, [load, user]);

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

  async function saveName(id: number) {
    if (!editFirstName.trim()) return;
    await authFetch({ action: 'set_name', user_id: id, first_name: editFirstName.trim(), last_name: editLastName.trim() });
    setEditNameId(null);
    setEditFirstName('');
    setEditLastName('');
    load();
  }

  async function toggleTgMuted(u: TeamUser) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, tg_notify_muted: !u.tg_notify_muted } : x)));
    await authFetch({ action: 'set_tg_muted', user_id: u.id, tg_notify_muted: !u.tg_notify_muted });
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

  async function revokeSession(sessionId: number) {
    setRevokingId(sessionId);
    try {
      await authFetch({ action: 'revoke_session', session_id: sessionId });
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, active: false } : s)));
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAllSessions() {
    if (!sessionsFor) return;
    setRevokingAll(true);
    try {
      await authFetch({ action: 'revoke_sessions', user_id: sessionsFor.id });
      await openSessions(sessionsFor);
    } finally {
      setRevokingAll(false);
    }
  }

  async function setRole(id: number, role: 'member' | 'admin') {
    await authFetch({ action: 'set_role', user_id: id, role });
    load();
  }

  async function toggleActive(u: TeamUser) {
    await authFetch({ action: 'set_active', user_id: u.id, is_active: !u.is_active });
    load();
  }

  async function toggleShowInTeam(u: TeamUser) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, show_in_team: !u.show_in_team } : x)));
    await authFetch({ action: 'set_show_in_team', user_id: u.id, show_in_team: !u.show_in_team });
  }

  async function toggleShowTgContact(u: TeamUser) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, show_tg_contact: !u.show_tg_contact } : x)));
    await authFetch({ action: 'set_show_tg_contact', user_id: u.id, show_tg_contact: !u.show_tg_contact });
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
      navigate('/cabinet', { replace: true });
      window.location.reload();
    } finally {
      setImpersonatingId(null);
    }
  }

  function openPerms(u: TeamUser) {
    setPermsForId(u.id);
    setPermsDraft({ ...u.permissions });
    setPermsError('');
  }

  async function savePerms(id: number) {
    setPermsSaving(true);
    setPermsError('');
    const res = await authFetch({ action: 'set_permissions', user_id: id, permissions: permsDraft });
    setPermsSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setPermsError(
        err.error === 'owner_only_permission'
          ? 'Изменять эту привилегию может только руководитель проекта'
          : 'Не удалось сохранить права — попробуйте ещё раз'
      );
      return;
    }
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

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    const res = await authFetch({ action: 'files_list' });
    if (res.ok) {
      const data = await res.json();
      setFiles(data);
    } else {
      setFiles(null);
    }
    setFilesLoading(false);
    setFilesLoaded(true);
  }, []);

  useEffect(() => {
    if (section === 'storage' && !filesLoaded) loadFiles();
  }, [section, filesLoaded, loadFiles]);

  const loadActivity = useCallback(async (userFilter: number | 'all', range: DateRange | undefined) => {
    setActivityLoading(true);
    const payload: Record<string, unknown> = { action: 'activity_log' };
    if (userFilter !== 'all') payload.user_id = userFilter;
    if (range?.from) {
      const from = new Date(range.from);
      from.setHours(0, 0, 0, 0);
      payload.from = from.toISOString();
      const to = range.to ? new Date(range.to) : new Date(range.from);
      to.setHours(23, 59, 59, 999);
      payload.to = to.toISOString();
    }
    const res = await authFetch(payload);
    if (res.ok) {
      const data = await res.json();
      setActivityEntries(data.entries || []);
    } else {
      setActivityEntries([]);
    }
    setActivityLoading(false);
    setActivityLoaded(true);
  }, []);

  useEffect(() => {
    if (section === 'activity' && !activityLoaded) loadActivity(activityUserFilter, activityRange);
  }, [section, activityLoaded, loadActivity, activityUserFilter, activityRange]);

  function setActivityUserFilterAndReload(v: number | 'all') {
    setActivityUserFilter(v);
    loadActivity(v, activityRange);
  }

  function setActivityRangeAndReload(r: DateRange | undefined) {
    setActivityRange(r);
    loadActivity(activityUserFilter, r);
  }

  async function deleteFile(section: 'knowledge' | 'ideas' | 'tasks', entityId: string, attachmentId: string) {
    await authFetch({ action: 'file_delete', section, entityId, attachmentId });
    setFiles((prev) => {
      if (!prev) return prev;
      const strip = (list: typeof prev.knowledge) => list.filter((a) => a.id !== attachmentId);
      return {
        knowledge: strip(prev.knowledge),
        ideas: strip(prev.ideas),
        tasksActive: strip(prev.tasksActive),
        tasksArchived: strip(prev.tasksArchived),
      };
    });
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (!user) return null;

  function handleSelect(s: CabinetSection) {
    setSection(s);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-background flex">
      <CabinetSidebar active={section} onSelect={handleSelect} hasTeamAccess={hasTeamAccess} onBoard={() => navigate('/')} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <SidebarContent active={section} onSelect={handleSelect} hasTeamAccess={hasTeamAccess} onBoard={() => navigate('/')} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6 bg-card/40">
          <button
            onClick={() => setMenuOpen(true)}
            className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Icon name="Menu" size={18} />
          </button>
          <span className="text-sm text-muted-foreground">{cabinetSectionLabel(section)}</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => navigate('/')} className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg bg-secondary/60 text-sm hover:bg-secondary transition-colors">
              <Icon name="LayoutGrid" size={15} /> Доска
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Icon name="LogOut" size={15} />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
          {section === 'profile' && <CabinetProfile user={user} />}

          {section === 'project' && hasTeamAccess && <CabinetProject />}

          {section === 'stats' && (
            <CabinetStats user={user} hasTeamAccess={hasTeamAccess} users={users} usersLoading={usersLoading} />
          )}

          {section === 'faq' && <Faq isAdmin={isAdmin} />}

          {section === 'team' && hasTeamAccess && (
            <div className="max-w-4xl">
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
                loading={usersLoading}
                currentUserId={user.id}
                isRealAdmin={isRealAdmin}
                editSpecId={editSpecId}
                setEditSpecId={setEditSpecId}
                editSpecValue={editSpecValue}
                setEditSpecValue={setEditSpecValue}
                saveSpec={saveSpec}
                editNameId={editNameId}
                setEditNameId={setEditNameId}
                editFirstName={editFirstName}
                setEditFirstName={setEditFirstName}
                editLastName={editLastName}
                setEditLastName={setEditLastName}
                saveName={saveName}
                openSessions={openSessions}
                permsForId={permsForId}
                setPermsForId={setPermsForId}
                openPerms={openPerms}
                permsDraft={permsDraft}
                setPermsDraft={setPermsDraft}
                permsSaving={permsSaving}
                permsError={permsError}
                savePerms={savePerms}
                isOwner={isOwner}
                openStats={openStats}
                setRole={setRole}
                toggleActive={toggleActive}
                toggleShowInTeam={toggleShowInTeam}
                toggleTgMuted={toggleTgMuted}
                toggleShowTgContact={toggleShowTgContact}
                hideUser={hideUser}
                impersonate={impersonate}
                impersonatingId={impersonatingId}
              />
            </div>
          )}

          {section === 'activity' && hasTeamAccess && (
            <div className="max-w-3xl">
              <h1 className="text-xl font-semibold mb-1">Журнал</h1>
              <p className="text-sm text-muted-foreground mb-6">
                {activityLoading ? 'Загрузка...' : `${activityEntries.length} записей · хранится 7 дней`}
              </p>
              <ActivityLogList
                loading={activityLoading}
                entries={activityEntries}
                users={users}
                userFilter={activityUserFilter}
                setUserFilter={setActivityUserFilterAndReload}
                range={activityRange}
                setRange={setActivityRangeAndReload}
              />
            </div>
          )}

          {section === 'storage' && hasTeamAccess && (
            <div className="max-w-3xl">
              <h1 className="text-xl font-semibold mb-1">Хранилище</h1>
              <p className="text-sm text-muted-foreground mb-6">Все файлы, залитые в базу знаний, идеи и задачи.</p>
              <FilesList loading={filesLoading} files={files} onDelete={deleteFile} />
            </div>
          )}
        </main>
      </div>

      {sessionsFor && (
        <SessionsModal
          sessionsFor={sessionsFor}
          onClose={() => setSessionsFor(null)}
          sessionsLoading={sessionsLoading}
          sessions={sessions}
          onRevokeSession={revokeSession}
          onRevokeAll={revokeAllSessions}
          revokingId={revokingId}
          revokingAll={revokingAll}
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
