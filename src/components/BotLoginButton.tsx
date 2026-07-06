import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../backend/func2url.json';
import { useAuth } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

const LOGIN_CODE_URL = (func2url as Record<string, string>)['login-code'];

interface Props {
  onSuccess: (user: AuthUser) => void;
  onError: (message: string) => void;
}

export default function BotLoginButton({ onSuccess, onError }: Props) {
  const { applySession } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startLogin = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch(LOGIN_CODE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await res.json();
      if (!res.ok || !data.code) throw new Error('create_failed');

      setCode(data.code);
      setDeepLink(data.deep_link || null);
      setWaiting(true);

      if (data.deep_link) window.open(data.deep_link, '_blank');

      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const sres = await fetch(`${LOGIN_CODE_URL}?action=status&code=${data.code}`);
          const sdata = await sres.json();
          if (sdata.status === 'confirmed' && sdata.token) {
            stopPolling();
            setWaiting(false);
            applySession(sdata.token, sdata.user);
            onSuccess(sdata.user);
          } else if (sdata.status === 'denied') {
            stopPolling();
            setWaiting(false);
            setCode(null);
            onError(
              sdata.error === 'inactive'
                ? 'Ваш аккаунт деактивирован. Обратитесь к руководителю.'
                : 'У вашего аккаунта нет доступа. Попросите руководителя добавить вас в команду.'
            );
          } else if (sdata.status === 'expired') {
            stopPolling();
            setWaiting(false);
            setCode(null);
            onError('Код устарел. Нажмите «Войти через бота» ещё раз.');
          }
        } catch {
          /* ignore transient errors */
        }
      }, 2500);
    } catch {
      onError('Не удалось создать код. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }, [applySession, onSuccess, onError, stopPolling]);

  if (waiting && code) {
    return (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="text-sm text-muted-foreground text-center">
          В открывшемся боте нажмите синюю кнопку <span className="font-medium text-foreground">«Запустить»</span> (Start) внизу экрана.
        </div>
        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#229ED9] text-white text-sm font-medium px-4 py-3 hover:opacity-90 transition-opacity"
          >
            <Icon name="Send" size={16} />
            Открыть бота ещё раз
          </a>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="Loader2" size={14} className="animate-spin" />
          Ждём подтверждения входа...
        </div>
        <details className="w-full text-center">
          <summary className="text-xs text-muted-foreground/70 cursor-pointer hover:text-muted-foreground">Бот не открылся?</summary>
          <div className="mt-2 text-xs text-muted-foreground">
            Откройте бота вручную и отправьте команду:
            <div className="mt-1.5 text-sm font-mono font-semibold tracking-widest bg-secondary rounded-lg px-3 py-2 select-all inline-block">
              /start {code}
            </div>
          </div>
        </details>
      </div>
    );
  }

  return (
    <button
      onClick={startLogin}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#229ED9] text-white text-sm font-medium px-4 py-3 hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {loading ? (
        <Icon name="Loader2" size={16} className="animate-spin" />
      ) : (
        <Icon name="Send" size={16} />
      )}
      Войти через бота
    </button>
  );
}