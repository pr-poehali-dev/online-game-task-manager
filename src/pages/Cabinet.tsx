import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import ThemeToggle from '@/components/ThemeToggle';
import Faq from '@/components/Faq';
import InviteForm from './admin/InviteForm';
import UserList from './admin/UserList';
import SessionsModal from './admin/SessionsModal';
import StatsModal from './admin/StatsModal';
import FilesList from './admin/FilesList';
import ActivityLogList from './admin/ActivityLogList';
import CabinetSidebar, { SidebarContent, cabinetSectionLabel } from './cabinet/CabinetSidebar';
import type { CabinetSection } from './cabinet/CabinetSidebar';
import CabinetProfile from './cabinet/CabinetProfile';
import CabinetProject from './cabinet/CabinetProject';
import CabinetStats from './cabinet/CabinetStats';
import { useTeamManagement } from './cabinet/useTeamManagement';
import { useSessionsAndStats } from './cabinet/useSessionsAndStats';
import { useFilesAndActivity } from './cabinet/useFilesAndActivity';

export default function Cabinet() {
  const navigate = useNavigate();
  const { user, isAdmin, logout, applySession } = useAuth();
  const [section, setSection] = useState<CabinetSection>('profile');
  const [menuOpen, setMenuOpen] = useState(false);

  // ВАЖНО: разделы раньше монтировались/размонтировались условно ({section === 'x' && <X/>}) —
  // при каждом переключении вкладки компонент создавался заново с нуля, что заново запускало его
  // useEffect с загрузкой данных (см. Faq.tsx/CabinetStats.tsx — у каждого свой fetch при
  // монтировании) — отсюда спиннер при КАЖДОМ переходе между разделами, даже повторном (тот же
  // паттерн проблемы уже был решён для доски задач, см. IndexMain.tsx).
  //
  // Теперь каждый раздел монтируется ОДИН РАЗ — при первом посещении за сессию — и дальше
  // остаётся смонтированным навсегда (см. visited, пополняется по мере переключения section).
  // Переключение вкладки лишь скрывает/показывает нужный div через CSS (display: none) — сам
  // компонент и его загруженные данные никуда не деваются, повторные визиты мгновенные, без
  // спиннера. При этом НЕ грузим сразу все 7 разделов при заходе в кабинет — только те, что
  // пользователь реально открыл (profile — раздел по умолчанию, поэтому смонтирован сразу).
  const [visited, setVisited] = useState<Set<string>>(() => new Set([section]));
  const seenSection = useRef(section);
  if (seenSection.current !== section) {
    seenSection.current = section;
    if (!visited.has(section)) setVisited((prev) => new Set(prev).add(section));
  }

  const team = useTeamManagement(user, navigate, applySession);
  const sessionsAndStats = useSessionsAndStats();
  const filesAndActivity = useFilesAndActivity(section);

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
      <CabinetSidebar active={section} onSelect={handleSelect} hasTeamAccess={team.hasTeamAccess} onBoard={() => navigate('/')} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <SidebarContent active={section} onSelect={handleSelect} hasTeamAccess={team.hasTeamAccess} onBoard={() => navigate('/')} />
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
          {visited.has('profile') && (
            <div className={section === 'profile' ? '' : 'hidden'}>
              <CabinetProfile user={user} />
            </div>
          )}

          {visited.has('project') && team.hasTeamAccess && (
            <div className={section === 'project' ? '' : 'hidden'}>
              <CabinetProject />
            </div>
          )}

          {visited.has('stats') && (
            <div className={section === 'stats' ? '' : 'hidden'}>
              <CabinetStats user={user} hasTeamAccess={team.hasTeamAccess} users={team.users} usersLoading={team.usersLoading} />
            </div>
          )}

          {visited.has('faq') && (
            <div className={section === 'faq' ? '' : 'hidden'}>
              <Faq isAdmin={isAdmin} />
            </div>
          )}

          {visited.has('team') && team.hasTeamAccess && (
            <div className={section === 'team' ? 'max-w-4xl' : 'hidden'}>
              <h1 className="text-xl font-semibold mb-1">Управление командой</h1>
              <p className="text-sm text-muted-foreground mb-6">Выдавайте доступ и назначайте администраторов. Приглашённый войдёт через Telegram.</p>

              <InviteForm
                inviteName={team.inviteName}
                setInviteName={team.setInviteName}
                inviteRole={team.inviteRole}
                setInviteRole={team.setInviteRole}
                inviteSpec={team.inviteSpec}
                setInviteSpec={team.setInviteSpec}
                inviting={team.inviting}
                onInvite={team.invite}
              />

              <UserList
                users={team.users}
                loading={team.usersLoading}
                currentUserId={user.id}
                isRealAdmin={team.isRealAdmin}
                editSpecId={team.editSpecId}
                setEditSpecId={team.setEditSpecId}
                editSpecValue={team.editSpecValue}
                setEditSpecValue={team.setEditSpecValue}
                saveSpec={team.saveSpec}
                editNameId={team.editNameId}
                setEditNameId={team.setEditNameId}
                editFirstName={team.editFirstName}
                setEditFirstName={team.setEditFirstName}
                editLastName={team.editLastName}
                setEditLastName={team.setEditLastName}
                saveName={team.saveName}
                openSessions={sessionsAndStats.openSessions}
                permsForId={team.permsForId}
                setPermsForId={team.setPermsForId}
                openPerms={team.openPerms}
                permsDraft={team.permsDraft}
                setPermsDraft={team.setPermsDraft}
                permsSaving={team.permsSaving}
                permsError={team.permsError}
                savePerms={team.savePerms}
                isOwner={team.isOwner}
                openStats={sessionsAndStats.openStats}
                setRole={team.setRole}
                toggleActive={team.toggleActive}
                toggleShowInTeam={team.toggleShowInTeam}
                toggleTgMuted={team.toggleTgMuted}
                toggleShowTgContact={team.toggleShowTgContact}
                hideUser={team.hideUser}
                impersonate={team.impersonate}
                impersonatingId={team.impersonatingId}
              />
            </div>
          )}

          {visited.has('activity') && team.hasTeamAccess && (
            <div className={section === 'activity' ? 'max-w-3xl' : 'hidden'}>
              <h1 className="text-xl font-semibold mb-1">Журнал</h1>
              <p className="text-sm text-muted-foreground mb-6">
                {filesAndActivity.activityLoading ? 'Загрузка...' : `${filesAndActivity.activityEntries.length} записей · хранится 7 дней`}
              </p>
              <ActivityLogList
                loading={filesAndActivity.activityLoading}
                entries={filesAndActivity.activityEntries}
                users={team.users}
                userFilter={filesAndActivity.activityUserFilter}
                setUserFilter={filesAndActivity.setActivityUserFilterAndReload}
                range={filesAndActivity.activityRange}
                setRange={filesAndActivity.setActivityRangeAndReload}
              />
            </div>
          )}

          {visited.has('storage') && team.hasTeamAccess && (
            <div className={section === 'storage' ? 'max-w-3xl' : 'hidden'}>
              <h1 className="text-xl font-semibold mb-1">Хранилище</h1>
              <p className="text-sm text-muted-foreground mb-6">Все файлы, залитые в базу знаний, идеи и задачи.</p>
              <FilesList loading={filesAndActivity.filesLoading} files={filesAndActivity.files} onDelete={filesAndActivity.deleteFile} />
            </div>
          )}
        </main>
      </div>

      {sessionsAndStats.sessionsFor && (
        <SessionsModal
          sessionsFor={sessionsAndStats.sessionsFor}
          onClose={() => sessionsAndStats.setSessionsFor(null)}
          sessionsLoading={sessionsAndStats.sessionsLoading}
          sessions={sessionsAndStats.sessions}
          onRevokeSession={sessionsAndStats.revokeSession}
          onRevokeAll={sessionsAndStats.revokeAllSessions}
          revokingId={sessionsAndStats.revokingId}
          revokingAll={sessionsAndStats.revokingAll}
        />
      )}

      {sessionsAndStats.statsFor && (
        <StatsModal
          statsFor={sessionsAndStats.statsFor}
          onClose={() => sessionsAndStats.setStatsFor(null)}
          statsCalendarOpen={sessionsAndStats.statsCalendarOpen}
          setStatsCalendarOpen={sessionsAndStats.setStatsCalendarOpen}
          statsRange={sessionsAndStats.statsRange}
          applyStatsRange={sessionsAndStats.applyStatsRange}
          statsLoading={sessionsAndStats.statsLoading}
          stats={sessionsAndStats.stats}
        />
      )}
    </div>
  );
}