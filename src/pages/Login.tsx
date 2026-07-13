import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import BotLoginButton from '@/components/BotLoginButton';
import type { AuthUser } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
// === DEV_LOGIN_START — тестовый вход в обход Telegram-бота. УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ ===
import DevLoginPanel from '@/components/DevLoginPanel';
// === DEV_LOGIN_END ===

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  function handleSuccess(user: AuthUser) {
    setError(null);
    // Если пришли по прямой ссылке (например из уведомления в Telegram) — возвращаемся туда
    const next = searchParams.get('next');
    if (next) {
      navigate(decodeURIComponent(next), { replace: true });
      return;
    }
    navigate(user.role === 'admin' ? '/admin' : '/cabinet', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="font-display tracking-widest text-2xl" style={{ letterSpacing: '0.14em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Вход для команды</h1>
          <p className="text-sm text-muted-foreground">
            Войдите через Telegram-бота, чтобы попасть в свой кабинет
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-4">
          <BotLoginButton onSuccess={handleSuccess} onError={setError} />

          {error && (
            <div className="w-full flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <Icon name="TriangleAlert" size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* === DEV_LOGIN_START — тестовый вход в обход Telegram-бота. УДАЛИТЬ ПЕРЕД ПРОДАКШЕНОМ === */}
        <DevLoginPanel onSuccess={handleSuccess} onError={setError} />
        {/* === DEV_LOGIN_END === */}

        <button
          onClick={() => navigate('/')}
          className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="ArrowLeft" size={14} />
          На главную
        </button>
      </div>
    </div>
  );
}