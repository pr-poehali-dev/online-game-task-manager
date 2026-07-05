import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import TelegramLoginButton from '@/components/TelegramLoginButton';
import { useAuth } from '@/lib/auth';
import type { TelegramAuthData } from '@/lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const { loginWithTelegram } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAuth(data: TelegramAuthData) {
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithTelegram(data);
      navigate(user.role === 'admin' ? '/admin' : '/cabinet', { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'login_failed';
      if (msg === 'inactive') setError('Ваш аккаунт деактивирован. Обратитесь к руководителю.');
      else if (msg === 'bad_signature') setError('Не удалось подтвердить вход через Telegram. Попробуйте ещё раз.');
      else setError('Ошибка входа. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="font-display tracking-widest text-2xl" style={{ letterSpacing: '0.14em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Вход для команды</h1>
          <p className="text-sm text-muted-foreground">
            Авторизуйтесь через Telegram, чтобы попасть в свой кабинет
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-4">
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Icon name="Loader2" size={16} className="animate-spin" />
              Входим...
            </div>
          ) : (
            <TelegramLoginButton onAuth={handleAuth} />
          )}

          {error && (
            <div className="w-full flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <Icon name="TriangleAlert" size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
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
