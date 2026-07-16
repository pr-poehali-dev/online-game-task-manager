import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { fmtDay, activityMeta } from './adminShared';
import type { ActivityEntry, TeamUser } from './adminShared';

function dayKey(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
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

export default function ActivityLogModal({
  onClose,
  loading,
  entries,
  users,
  userFilter,
  setUserFilter,
  range,
  setRange,
}: {
  onClose: () => void;
  loading: boolean;
  entries: ActivityEntry[];
  users: TeamUser[];
  userFilter: number | 'all';
  setUserFilter: (v: number | 'all') => void;
  range: DateRange | undefined;
  setRange: (r: DateRange | undefined) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Журнал действий команды</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Загрузка...' : `${entries.length} записей · хранится 7 дней`}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm focus:outline-none max-w-[45%]"
          >
            <option value="all">Все участники</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name ?? ''}</option>
            ))}
          </select>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm hover:bg-secondary transition-colors min-w-0">
                <Icon name="Calendar" size={15} className="text-muted-foreground shrink-0" />
                <span className="truncate">
                  {range?.from
                    ? range.to
                      ? `${fmtDay(range.from)} — ${fmtDay(range.to)}`
                      : fmtDay(range.from)
                    : 'Последние 7 дней'}
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

        {loading ? (
          <div className="flex justify-center py-10">
            <Icon name="Loader2" size={22} className="animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Записей не найдено</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, items]) => (
              <div key={key}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 px-0.5">{fmtDayHeader(key)}</div>
                <div className="space-y-1.5">
                  {items.map((e) => {
                    const meta = activityMeta(e.action);
                    return (
                      <div key={e.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                        <span
                          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center"
                          style={{ background: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}
                        >
                          <Icon name={meta.icon} size={14} />
                        </span>
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="font-medium">
                            <span className="text-foreground">{e.userName}</span>
                            <span className="text-muted-foreground"> · {meta.label}</span>
                          </div>
                          {(e.entityTitle || e.details) && (
                            <div className="text-muted-foreground truncate">
                              {e.entityTitle && <span>«{e.entityTitle}»</span>}
                              {e.entityTitle && e.details && ' · '}
                              {e.details}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtTime(e.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
