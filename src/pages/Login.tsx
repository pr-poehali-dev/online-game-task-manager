import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import BotLoginButton from '@/components/BotLoginButton';
import type { AuthUser } from '@/lib/auth';
import { useAuth } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
import DevOnlyLoginButton from '@/components/DevOnlyLoginButton';
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { applySession } = useAuth();

  function handleSuccess(_user: AuthUser) {
    setError(null);
    // Если пришли по прямой ссылке (например из уведомления в Telegram) — возвращаемся туда
    const next = searchParams.get('next');
    if (next) {
      navigate(decodeURIComponent(next), { replace: true });
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background grid-bg px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Знак + название вместо голого текста: фирменный блок собирает страницу и даёт
              точку входа для взгляда. Тот же знак, что в боковом меню, — узнаваемость. */}
          <div className="inline-flex items-center gap-3 mb-4">
            <div
              className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 shadow-accent"
              style={{ background: 'linear-gradient(135deg, hsl(35 85% 42%), hsl(45 92% 58%))' }}
            >
              <Icon name="Swords" size={22} className="text-black/80" />
            </div>
            <span className="font-display tracking-widest text-2xl" style={{ letterSpacing: '0.14em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Вход для команды</h1>
          <p className="text-sm text-muted-foreground">
            Войдите через Telegram-бота, чтобы попасть в свой кабинет
          </p>
        </div>

        {/* Карточка входа поднята над фоном тенью и светлой верхней гранью — это первое, что
            видит человек, и плоская панель здесь сразу задаёт «бюджетное» впечатление. */}
        <div className="rounded-2xl border border-border/70 bg-card p-6 flex flex-col items-center gap-4 shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.05),0_12px_32px_-8px_hsl(222_30%_2%/0.5)]">
          <BotLoginButton onSuccess={handleSuccess} onError={setError} />

          {error && (
            <div className="w-full flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <Icon name="TriangleAlert" size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <DevOnlyLoginButton applySession={applySession} onSuccess={handleSuccess} onError={setError} />
        </div>

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