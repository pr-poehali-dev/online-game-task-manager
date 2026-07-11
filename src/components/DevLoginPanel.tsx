// === DEV_LOGIN_START — тестовый вход в обход Telegram-бота. УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ ===
// Этот компонент нужен только для просмотра превью на poehali.dev, пока Telegram-бот
// настроен на боевой хостинг и не может подтверждать вход отсюда.
// Перед заливкой обновления на сайт — удалить этот файл и все места его использования
// (см. маркеры DEV_LOGIN_START / DEV_LOGIN_END в src/pages/Login.tsx).
import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../backend/func2url.json';
import { useAuth } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

const AUTH_URL = (func2url as Record<string, string>).auth;

interface DevUser {
  id: number;
  first_name: string;
  last_name: string | null;
  role: 'admin' | 'member';
  tg_username: string | null;
  is_active: boolean;
}

export default function DevLoginPanel({ onSuccess, onError }: {
  onSuccess: (user: AuthUser) => void;
  onError: (message: string) => void;
}) {
  const { applySession } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingInId, setLoggingInId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dev_users' }),
      });
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, loadUsers]);

  async function loginAs(userId: number) {
    setLoggingInId(userId);
    onError('');
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dev_login', user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        onError('Не удалось войти. Аккаунт неактивен?');
        return;
      }
      applySession(data.token, data.user);
      onSuccess(data.user);
    } catch {
      onError('Не удалось войти в тестовом режиме.');
    } finally {
      setLoggingInId(null);
    }
  }

  return (
    <div className="w-full mt-4 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-medium text-amber-500"
      >
        <Icon name="FlaskConical" size={15} />
        Тестовый вход (без Telegram-бота)
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} className="ml-auto" />
      </button>
      <p className="text-xs text-muted-foreground mt-1.5">
        Только для просмотра превью здесь, на poehali.dev. Уберём перед заливкой на боевой сайт.
      </p>

      {open && (
        <div className="mt-3 space-y-1.5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Icon name="Loader2" size={13} className="animate-spin" />
              Загрузка списка команды...
            </div>
          )}
          {!loading && users.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">Нет доступных аккаунтов.</div>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => loginAs(u.id)}
              disabled={!u.is_active || loggingInId !== null}
              className="w-full flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-amber-500/50 transition-colors disabled:opacity-40"
            >
              <Icon name={u.role === 'admin' ? 'Shield' : 'User'} size={14} className="text-muted-foreground shrink-0" />
              <span className="truncate">{u.first_name}{u.last_name ? ' ' + u.last_name : ''}</span>
              {u.tg_username && <span className="text-xs text-muted-foreground truncate">@{u.tg_username}</span>}
              {!u.is_active && <span className="text-xs text-destructive ml-auto shrink-0">неактивен</span>}
              {loggingInId === u.id && <Icon name="Loader2" size={13} className="animate-spin ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// === DEV_LOGIN_END ===
