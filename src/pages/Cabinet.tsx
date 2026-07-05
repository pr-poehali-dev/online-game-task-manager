import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';

export default function Cabinet() {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center gap-4 px-6 bg-card/40">
        <span className="font-display tracking-widest text-base" style={{ letterSpacing: '0.12em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm text-muted-foreground">Личный кабинет</span>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 h-8 px-3 rounded-lg bg-secondary/60 text-sm hover:bg-secondary transition-colors"
            >
              <Icon name="Shield" size={15} />
              Админка
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Icon name="LogOut" size={15} />
            Выйти
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-4">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.first_name} className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-primary/15 flex items-center justify-center text-primary text-xl font-semibold">
              {user.first_name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{user.first_name} {user.last_name ?? ''}</h1>
            {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">
              {user.role === 'admin' ? 'Администратор' : 'Участник команды'}
            </span>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Icon name="LayoutGrid" size={15} />
            Перейти к доске задач
          </button>
        </div>
      </main>
    </div>
  );
}
