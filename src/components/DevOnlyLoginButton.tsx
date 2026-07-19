// ⚠️ ВРЕМЕННЫЙ компонент только для тестового превью в редакторе poehali.dev.
// Кнопка видна ТОЛЬКО на домене *.poehali.dev — на боевом self-hosted сервере
// (другой домен) не отображается вообще. НИКОГДА не переносить этот файл
// и backend/dev-login в папку update/ — только для просмотра здесь, в редакторе.
import { useState } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../backend/func2url.json';
import type { AuthUser } from '@/lib/auth';

const DEV_LOGIN_URL = (func2url as Record<string, string>)['dev-login'];
const IS_POEHALI_PREVIEW = typeof window !== 'undefined' && window.location.hostname.endsWith('poehali.dev');

interface Props {
  applySession: (token: string, user: AuthUser) => void;
  onSuccess: (user: AuthUser) => void;
  onError: (message: string) => void;
}

export default function DevOnlyLoginButton({ applySession, onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(false);

  if (!IS_POEHALI_PREVIEW) return null;

  async function handleClick() {
    setLoading(true);
    onError('');
    try {
      const res = await fetch(DEV_LOGIN_URL, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error('dev_login_failed');
      applySession(data.token, data.user);
      onSuccess(data.user);
    } catch {
      onError('Тестовый вход не удался. Проверьте, что в базе есть активный администратор.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full pt-3 mt-1 border-t border-dashed border-border/70">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-amber-500/40 text-amber-500/90 text-xs font-medium px-4 py-2.5 hover:bg-amber-500/10 transition-colors disabled:opacity-60"
      >
        {loading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="FlaskConical" size={14} />}
        Тестовый вход (только для превью)
      </button>
    </div>
  );
}
