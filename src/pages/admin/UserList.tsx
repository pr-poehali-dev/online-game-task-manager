import Icon from '@/components/ui/icon';
import UserCardInfo from './UserCardInfo';
import UserCardActions from './UserCardActions';
import UserPermissionsPanel from './UserPermissionsPanel';
import type { TeamUser, Permissions } from './adminShared';

export default function UserList({
  users,
  loading,
  currentUserId,
  isRealAdmin,
  editSpecId,
  setEditSpecId,
  editSpecValue,
  setEditSpecValue,
  saveSpec,
  editAiLimitId,
  setEditAiLimitId,
  editAiLimitValue,
  setEditAiLimitValue,
  saveAiLimit,
  editAiFileLimitId,
  setEditAiFileLimitId,
  editAiFileLimitValue,
  setEditAiFileLimitValue,
  saveAiFileLimit,
  editAiSizeLimitId,
  setEditAiSizeLimitId,
  editAiSizeLimitValue,
  setEditAiSizeLimitValue,
  saveAiSizeLimit,
  editAiProjectLimitId,
  setEditAiProjectLimitId,
  editAiProjectLimitValue,
  setEditAiProjectLimitValue,
  saveAiProjectLimit,
  editNameId,
  setEditNameId,
  editFirstName,
  setEditFirstName,
  editLastName,
  setEditLastName,
  saveName,
  openSessions,
  permsForId,
  setPermsForId,
  openPerms,
  permsDraft,
  setPermsDraft,
  permsSaving,
  permsError,
  savePerms,
  isOwner,
  openStats,
  setRole,
  toggleActive,
  toggleShowInTeam,
  toggleTgMuted,
  toggleShowTgContact,
  hideUser,
  impersonate,
  impersonatingId,
}: {
  users: TeamUser[];
  loading: boolean;
  currentUserId: number | undefined;
  // isRealAdmin — true только для настоящей роли admin (не для участника с делегированным правом
  // team_manage) — управляет видимостью действий из ADMIN_ONLY_ACTIONS на backend (impersonate,
  // изменение индивидуальных прав, смена роли): backend всё равно отклонит эти действия от имени
  // делегата (403 admin_only_action), но честнее не показывать элементы управления, которые всё
  // равно не сработают, а не давать нажать и получить ошибку.
  isRealAdmin: boolean;
  editSpecId: number | null;
  setEditSpecId: (id: number | null) => void;
  editSpecValue: string;
  setEditSpecValue: (v: string) => void;
  saveSpec: (id: number) => void;
  editAiLimitId: number | null;
  setEditAiLimitId: (id: number | null) => void;
  editAiLimitValue: string;
  setEditAiLimitValue: (v: string) => void;
  saveAiLimit: (id: number) => void;
  editAiFileLimitId: number | null;
  setEditAiFileLimitId: (id: number | null) => void;
  editAiFileLimitValue: string;
  setEditAiFileLimitValue: (v: string) => void;
  saveAiFileLimit: (id: number) => void;
  editAiSizeLimitId: number | null;
  setEditAiSizeLimitId: (id: number | null) => void;
  editAiSizeLimitValue: string;
  setEditAiSizeLimitValue: (v: string) => void;
  saveAiSizeLimit: (id: number) => void;
  editAiProjectLimitId: number | null;
  setEditAiProjectLimitId: (id: number | null) => void;
  editAiProjectLimitValue: string;
  setEditAiProjectLimitValue: (v: string) => void;
  saveAiProjectLimit: (id: number) => void;
  editNameId: number | null;
  setEditNameId: (id: number | null) => void;
  editFirstName: string;
  setEditFirstName: (v: string) => void;
  editLastName: string;
  setEditLastName: (v: string) => void;
  saveName: (id: number) => void;
  openSessions: (u: TeamUser) => void;
  permsForId: number | null;
  setPermsForId: (id: number | null) => void;
  openPerms: (u: TeamUser) => void;
  permsDraft: Permissions;
  setPermsDraft: React.Dispatch<React.SetStateAction<Permissions>>;
  permsSaving: boolean;
  permsError: string;
  savePerms: (id: number) => void;
  isOwner: boolean;
  openStats: (u: TeamUser) => void;
  setRole: (id: number, role: 'member' | 'admin') => void;
  toggleActive: (u: TeamUser) => void;
  toggleShowInTeam: (u: TeamUser) => void;
  toggleTgMuted: (u: TeamUser) => void;
  toggleShowTgContact: (u: TeamUser) => void;
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
            <UserCardInfo
              u={u}
              pending={pending}
              editNameId={editNameId}
              setEditNameId={setEditNameId}
              editFirstName={editFirstName}
              setEditFirstName={setEditFirstName}
              editLastName={editLastName}
              setEditLastName={setEditLastName}
              saveName={saveName}
              editSpecId={editSpecId}
              setEditSpecId={setEditSpecId}
              editSpecValue={editSpecValue}
              setEditSpecValue={setEditSpecValue}
              saveSpec={saveSpec}
              editAiLimitId={editAiLimitId}
              setEditAiLimitId={setEditAiLimitId}
              editAiLimitValue={editAiLimitValue}
              setEditAiLimitValue={setEditAiLimitValue}
              saveAiLimit={saveAiLimit}
              editAiFileLimitId={editAiFileLimitId}
              setEditAiFileLimitId={setEditAiFileLimitId}
              editAiFileLimitValue={editAiFileLimitValue}
              setEditAiFileLimitValue={setEditAiFileLimitValue}
              saveAiFileLimit={saveAiFileLimit}
              editAiSizeLimitId={editAiSizeLimitId}
              setEditAiSizeLimitId={setEditAiSizeLimitId}
              editAiSizeLimitValue={editAiSizeLimitValue}
              setEditAiSizeLimitValue={setEditAiSizeLimitValue}
              saveAiSizeLimit={saveAiSizeLimit}
              editAiProjectLimitId={editAiProjectLimitId}
              setEditAiProjectLimitId={setEditAiProjectLimitId}
              editAiProjectLimitValue={editAiProjectLimitValue}
              setEditAiProjectLimitValue={setEditAiProjectLimitValue}
              saveAiProjectLimit={saveAiProjectLimit}
            />

            <UserCardActions
              u={u}
              currentUserId={currentUserId}
              isRealAdmin={isRealAdmin}
              openSessions={openSessions}
              permsForId={permsForId}
              setPermsForId={setPermsForId}
              openPerms={openPerms}
              openStats={openStats}
              impersonate={impersonate}
              impersonatingId={impersonatingId}
              setRole={setRole}
              toggleShowInTeam={toggleShowInTeam}
              toggleActive={toggleActive}
              hideUser={hideUser}
            />
          </div>

          {isRealAdmin && permsForId === u.id && (
            <UserPermissionsPanel
              u={u}
              permsDraft={permsDraft}
              setPermsDraft={setPermsDraft}
              permsSaving={permsSaving}
              permsError={permsError}
              savePerms={savePerms}
              setPermsForId={setPermsForId}
              isOwner={isOwner}
              toggleTgMuted={toggleTgMuted}
              toggleShowTgContact={toggleShowTgContact}
            />
          )}
          </div>
        );
      })}
    </div>
  );
}
