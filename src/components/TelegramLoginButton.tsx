import { useEffect, useRef } from 'react';
import type { TelegramAuthData } from '@/lib/auth';

const BOT_USERNAME = 'era_task_bot';

interface Props {
  onAuth: (data: TelegramAuthData) => void;
  buttonSize?: 'large' | 'medium' | 'small';
  cornerRadius?: number;
}

export default function TelegramLoginButton({ onAuth, buttonSize = 'large', cornerRadius = 12 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    (window as unknown as Record<string, unknown>).onTelegramAuth = (user: TelegramAuthData) => {
      onAuth(user);
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');

    container.innerHTML = '';
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [onAuth, buttonSize, cornerRadius]);

  return <div ref={ref} />;
}
