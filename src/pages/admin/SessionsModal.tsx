import Icon from '@/components/ui/icon';
import type { TeamUser, SessionInfo } from './adminShared';

export default function SessionsModal({
  sessionsFor,
  onClose,
  sessionsLoading,
  sessions,
}: {
  sessionsFor: TeamUser;
  onClose: () => void;
  sessionsLoading: boolean;
  sessions: SessionInfo[];
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Сессии — {sessionsFor.first_name}</h2>
            <p className="text-xs text-muted-foreground">Устройства и входы пользователя</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        {sessionsLoading ? (
          <div className="flex justify-center py-8"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Сессий нет</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${s.active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-medium">{s.active ? 'Активна' : 'Завершена'}</div>
                  <div className="text-muted-foreground">
                    Вход: {s.created_at ? new Date(s.created_at).toLocaleString('ru-RU') : '—'}
                  </div>
                  <div className="text-muted-foreground">
                    {s.active ? 'Истекает' : 'Истекла'}: {s.expires_at ? new Date(s.expires_at).toLocaleString('ru-RU') : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
