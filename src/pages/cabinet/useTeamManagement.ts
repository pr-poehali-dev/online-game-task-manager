import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { AuthUser } from '@/lib/auth';
import { ADMIN_URL, TOKEN_KEY, authFetch } from '../admin/adminShared';
import type { TeamUser, Permissions } from '../admin/adminShared';

export function useTeamManagement(user: AuthUser | null, navigate: NavigateFunction, applySession: (token: string, user: AuthUser) => void) {
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
  // accessChecked — отличает "права ещё не проверены" (сразу после захода в кабинет) от "проверили,
  // прав нет": пока false, сайдбар показывает нейтральные заглушки вместо пунктов Команда/Журнал/
  // Хранилище/Управление проектом (см. CabinetSidebar) — иначе эти пункты сначала не отображались
  // бы (hasTeamAccess по умолчанию false), а через долю секунды резко появлялись после ответа
  // сервера, из-за чего сайдбар визуально "дёргался".
  const [accessChecked, setAccessChecked] = useState(false);
  const [permsError, setPermsError] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteSpec, setInviteSpec] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editSpecId, setEditSpecId] = useState<number | null>(null);
  const [editSpecValue, setEditSpecValue] = useState('');
  const [editNameId, setEditNameId] = useState<number | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [permsForId, setPermsForId] = useState<number | null>(null);
  const [permsDraft, setPermsDraft] = useState<Permissions>({});
  const [permsSaving, setPermsSaving] = useState(false);

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
    setAccessChecked(true);
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

  return {
    users,
    usersLoading,
    isOwner,
    isRealAdmin,
    hasTeamAccess,
    accessChecked,
    permsError,
    impersonatingId,
    inviteName, setInviteName,
    inviteRole, setInviteRole,
    inviteSpec, setInviteSpec,
    inviting,
    editSpecId, setEditSpecId,
    editSpecValue, setEditSpecValue,
    editNameId, setEditNameId,
    editFirstName, setEditFirstName,
    editLastName, setEditLastName,
    permsForId, setPermsForId,
    permsDraft, setPermsDraft,
    permsSaving,
    load,
    invite,
    saveSpec,
    saveName,
    toggleTgMuted,
    setRole,
    toggleActive,
    toggleShowInTeam,
    toggleShowTgContact,
    hideUser,
    impersonate,
    openPerms,
    savePerms,
  };
}