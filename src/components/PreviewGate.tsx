// ⚠️ ВРЕМЕННЫЙ компонент только для публичного превью-домена poehali.dev.
// Активен ТОЛЬКО на домене *.poehali.dev — на боевом self-hosted сервере (другой домен)
// не показывается вообще, весь остальной сайт открывается как обычно.
// НИКОГДА не переносить этот файл и backend/preview-gate в папку update/ — это заглушка
// именно тестового превью в редакторе, у боевого сервера свой домен и она там не нужна.
//
// Ставит простой пароль ПЕРЕД всем приложением (см. App.tsx) — случайный человек, открывший
// ссылку на тестовый домен, не должен видеть даже форму входа команды. Это НЕ замена системе
// авторизации (backend/auth, вход через Telegram) — та отдельно защищает уже сами разделы
// внутри приложения. Успешный ввод пароля запоминается в localStorage на этом устройстве,
// повторно вводить не нужно, пока не очистить данные сайта в браузере.
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import func2url from '../../backend/func2url.json';

const GATE_URL = (func2url as Record<string, string>)['preview-gate'];
const IS_POEHALI_PREVIEW = typeof window !== 'undefined' && window.location.hostname.endsWith('poehali.dev');
const UNLOCK_KEY = 'era_preview_unlocked';

export default function PreviewGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => !IS_POEHALI_PREVIEW || localStorage.getItem(UNLOCK_KEY) === '1');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!IS_POEHALI_PREVIEW) setUnlocked(true);
  }, []);

  if (unlocked) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(GATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        localStorage.setItem(UNLOCK_KEY, '1');
        setUnlocked(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'gate_not_configured' ? 'Пароль ещё не задан в настройках проекта' : 'Неверный пароль');
    } catch {
      setError('Не удалось проверить пароль — проверьте соединение');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xs rounded-2xl border border-border/70 bg-card p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 justify-center mb-1 text-muted-foreground">
          <Icon name="Lock" size={18} />
          <span className="text-sm font-medium">Доступ ограничен</span>
        </div>
        <Input
          type="password"
          autoFocus
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Icon name="Loader2" size={14} className="animate-spin" /> : 'Войти'}
        </button>
      </form>
    </div>
  );
}
