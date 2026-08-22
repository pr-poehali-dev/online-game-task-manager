import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { AuthUser } from '@/lib/auth';
import { useAuth } from '@/lib/auth';
import { ADMIN_URL, TOKEN_KEY, authFetch } from '../admin/adminShared';
import type { TeamUser, Permissions } from '../admin/adminShared';

export function useTeamManagement(user: AuthUser | null, navigate: NavigateFunction, applySession: (token: string, user: AuthUser) => void) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const { can } = useAuth();
  // hasTeamAccess вычисляется СИНХРОННО из уже загруженного user.permissions (тот же расчёт, что
  // делает backend — admin ИЛИ явное точечное право team_manage, см. backend/admin/index.py
  // has_team_access) — НЕ дожидаясь отдельного GET-запроса к /admin. К моменту рендера Cabinet
  // user уже гарантированно загружен (см. ProtectedRoute — держит спиннер, пока идёт /auth),
  // поэтому пункты меню Команда/Журнал/Хранилище/Управление проектом в сайдбаре (см.
  // CabinetSidebar) видны сразу в первом кадре — без резкого появления/скелетонов после ответа
  // сервера, которое раньше вызывало заметное "дёргание" интерфейса при каждом заходе в кабинет.
  const hasTeamAccess = useMemo(() => !!user && (user.role === 'admin' || can('team_manage')), [user, can]);
  // isOwner/isRealAdmin по-прежнему приходят с backend при первой загрузке списка команды (нужны
  // только внутри самого раздела "Команда", а не для сайдбара, поэтому их отложенная загрузка не
  // вызывает визуальных скачков): isOwner — управляет выдачей/отзывом OWNER_ONLY_PERMISSION_GROUPS
  // (просмотр чужих приватных сообщений, редактирование патчей), isRealAdmin — true только для
  // настоящей роли admin (не для участника с делегированным team_manage) — управляет видимостью
  // действий, которые backend разрешает исключительно администраторам (impersonate/смена роли/
  // индивидуальные права, см. ADMIN_ONLY_ACTIONS).
  const [isOwner, setIsOwner] = useState(false);
  const [isRealAdmin, setIsRealAdmin] = useState(!!user && user.role === 'admin');
  const [permsError, setPermsError] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteSpec, setInviteSpec] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editSpecId, setEditSpecId] = useState<number | null>(null);
  const [editSpecValue, setEditSpecValue] = useState('');
  const [editAiLimitId, setEditAiLimitId] = useState<number | null>(null);
  const [editAiLimitValue, setEditAiLimitValue] = useState('');
  const [editAiFileLimitId, setEditAiFileLimitId] = useState<number | null>(null);
  const [editAiFileLimitValue, setEditAiFileLimitValue] = useState('');
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
    }
    setUsersLoading(false);
  }, []);

  // Список участников грузится только если у пользователя реально есть доступ (иначе backend
  // всё равно ответит 403, см. has_team_access в backend/admin/index.py) — hasTeamAccess уже
  // известен синхронно из user.permissions (см. выше), ждать здесь нечего.
  useEffect(() => { if (user && hasTeamAccess) load(); }, [load, user, hasTeamAccess]);

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

  async function saveAiLimit(id: number) {
    const value = Number(editAiLimitValue.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) { setEditAiLimitId(null); return; }
    await authFetch({ action: 'set_ai_limit', user_id: id, limit_rub: value });
    setEditAiLimitId(null);
    setEditAiLimitValue('');
    load();
  }

  // Лимит КОЛИЧЕСТВА файлов сотрудника в разделе "AI" (users.ai_file_limit) — 0 полностью
  // запрещает загрузку файлов, поэтому пустое/отрицательное значение просто отменяет правку.
  async function saveAiFileLimit(id: number) {
    const value = Number(editAiFileLimitValue.trim());
    if (!Number.isFinite(value) || value < 0) { setEditAiFileLimitId(null); return; }
    await authFetch({ action: 'set_ai_file_limit', user_id: id, file_limit: Math.round(value) });
    setEditAiFileLimitId(null);
    setEditAiFileLimitValue('');
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
    permsError,
    impersonatingId,
    inviteName, setInviteName,
    inviteRole, setInviteRole,
    inviteSpec, setInviteSpec,
    inviting,
    editSpecId, setEditSpecId,
    editSpecValue, setEditSpecValue,
    editAiLimitId, setEditAiLimitId,
    editAiLimitValue, setEditAiLimitValue,
    saveAiLimit,
    editAiFileLimitId, setEditAiFileLimitId,
    editAiFileLimitValue, setEditAiFileLimitValue,
    saveAiFileLimit,
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