import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { fmtDay } from './adminShared';
import type { TeamUser, SessionInfo } from './adminShared';

function dayKey(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function fmtDayHeader(key: string): string {
  if (key === '—') return 'Без даты';
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function SessionsModal({
  sessionsFor,
  onClose,
  sessionsLoading,
  sessions,
  onRevokeSession,
  onRevokeAll,
  revokingId,
  revokingAll,
}: {
  sessionsFor: TeamUser;
  onClose: () => void;
  sessionsLoading: boolean;
  sessions: SessionInfo[];
  onRevokeSession: (id: number) => void;
  onRevokeAll: () => void;
  revokingId: number | null;
  revokingAll: boolean;
}) {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const activeCount = sessions.filter((s) => s.active).length;

  const filtered = useMemo(() => {
    if (!range?.from) return sessions;
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = range.to ? new Date(range.to) : new Date(range.from);
    to.setHours(23, 59, 59, 999);
    return sessions.filter((s) => {
      if (!s.created_at) return false;
      const t = new Date(s.created_at).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  }, [sessions, range]);

  const groups = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const s of filtered) {
      const key = dayKey(s.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Сессии — {sessionsFor.first_name}</h2>
            <p className="text-xs text-muted-foreground">
              {sessionsLoading ? 'Загрузка...' : `${activeCount} активных · ${sessions.length} всего`}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm hover:bg-secondary transition-colors">
                <Icon name="Calendar" size={15} className="text-muted-foreground shrink-0" />
                <span className="truncate">
                  {range?.from
                    ? range.to
                      ? `${fmtDay(range.from)} — ${fmtDay(range.to)}`
                      : fmtDay(range.from)
                    : 'Все даты'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => { setRange(r); if (r?.from && r?.to) setCalendarOpen(false); }}
                numberOfMonths={1}
                defaultMonth={range?.from}
              />
            </PopoverContent>
          </Popover>
          {range?.from && (
            <button
              onClick={() => setRange(undefined)}
              title="Сбросить фильтр"
              className="h-9 w-9 shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon name="X" size={14} />
            </button>
          )}
        </div>

        {activeCount > 1 && (
          <button
            onClick={onRevokeAll}
            disabled={revokingAll}
            className="w-full flex items-center justify-center gap-2 h-9 px-3 mb-4 rounded-lg border border-destructive/40 text-destructive text-sm hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            {revokingAll ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="LogOut" size={14} />}
            Закрыть все активные сессии, кроме текущей
          </button>
        )}

        {sessionsLoading ? (
          <div className="flex justify-center py-8"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {sessions.length === 0 ? 'Сессий нет' : 'Нет сессий за выбранный период'}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, items]) => (
              <div key={key}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 px-0.5">{fmtDayHeader(key)}</div>
                <div className="space-y-1.5">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${s.active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-medium">{s.active ? 'Активна' : 'Завершена'}</div>
                        <div className="text-muted-foreground">
                          Вход {fmtTime(s.created_at)} · {s.active ? 'истекает' : 'истекла'} {fmtTime(s.expires_at)}
                        </div>
                      </div>
                      {s.active && (
                        <button
                          onClick={() => onRevokeSession(s.id)}
                          disabled={revokingId === s.id}
                          title="Закрыть сессию"
                          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          {revokingId === s.id ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="X" size={13} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
