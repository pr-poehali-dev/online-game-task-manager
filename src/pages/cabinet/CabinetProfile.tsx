import Icon from '@/components/ui/icon';
import type { AuthUser } from '@/lib/auth';

export default function CabinetProfile({ user }: { user: AuthUser }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Мой профиль</h1>
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-4">
        {user.photo_url ? (
          <img src={user.photo_url} alt={user.first_name} className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-primary/15 flex items-center justify-center text-primary text-xl font-semibold">
            {user.first_name.slice(0, 1)}
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold">{user.first_name} {user.last_name ?? ''}</h2>
          {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">
            {user.role === 'admin' ? 'Администратор' : 'Участник команды'}
          </span>
        </div>
      </div>

      {user.tg_username && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <Icon name="Send" size={16} className="text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Telegram</div>
            <a
              href={`https://t.me/${user.tg_username.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:underline hover:text-primary truncate"
            >
              @{user.tg_username.replace('@', '')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
