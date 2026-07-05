import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import func2url from '../../backend/func2url.json';

const ADMIN_URL = (func2url as Record<string, string>).admin;
const TOKEN_KEY = 'era_auth_token';

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
  const [inviting, setInviting] = useState(false);

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
    await authFetch({ action: 'invite', tg_username: name, role: inviteRole });
    setInviteName('');
    setInviteRole('member');
    setInviting(false);
    load();
  }

  async function setRole(id: number, role: 'member' | 'admin') {
    await authFetch({ action: 'set_role', user_id: id, role });
    load();
  }

  async function toggleActive(u: TeamUser) {
    await authFetch({ action: 'set_active', user_id: u.id, is_active: !u.is_active });
    load();
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
          <label className="block text-xs text-muted-foreground mb-2">Пригласить участника по Telegram @username</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center flex-1 rounded-lg border border-border bg-secondary/60 px-3">
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
            <button
              onClick={invite}
              disabled={inviting || !inviteName.trim()}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2 justify-center"
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
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-semibold">
                      {u.first_name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{u.first_name} {u.last_name ?? ''}</span>
                      {pending && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">ожидает входа</span>}
                      {!u.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">отключён</span>}
                    </div>
                    {(u.tg_username || u.username) && (
                      <a href={`https://t.me/${(u.tg_username || u.username || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        @{(u.tg_username || u.username || '').replace('@', '')}
                      </a>
                    )}
                  </div>

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
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
