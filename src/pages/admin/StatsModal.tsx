import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { fmtDuration, fmtDay } from './adminShared';
import type { TeamUser, UserStats } from './adminShared';

export default function StatsModal({
  statsFor,
  onClose,
  statsCalendarOpen,
  setStatsCalendarOpen,
  statsRange,
  applyStatsRange,
  statsLoading,
  stats,
}: {
  statsFor: TeamUser;
  onClose: () => void;
  statsCalendarOpen: boolean;
  setStatsCalendarOpen: (v: boolean) => void;
  statsRange: DateRange | undefined;
  applyStatsRange: (range: DateRange | undefined) => void;
  statsLoading: boolean;
  stats: UserStats | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Статистика — {statsFor.first_name}</h2>
            <p className="text-xs text-muted-foreground">Активность за выбранный период</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        <Popover open={statsCalendarOpen} onOpenChange={setStatsCalendarOpen}>
          <PopoverTrigger asChild>
            <button className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm hover:bg-secondary transition-colors mb-4">
              <Icon name="Calendar" size={15} className="text-muted-foreground" />
              {statsRange?.from
                ? statsRange.to
                  ? `${fmtDay(statsRange.from)} — ${fmtDay(statsRange.to)}`
                  : fmtDay(statsRange.from)
                : 'Выберите период'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={statsRange}
              onSelect={applyStatsRange}
              numberOfMonths={2}
              defaultMonth={statsRange?.from}
            />
          </PopoverContent>
        </Popover>

        {statsLoading ? (
          <div className="flex justify-center py-10"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Icon name="PlusCircle" size={13} />
                Создал задач
              </div>
              <div className="text-2xl font-semibold">{stats.createdCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Icon name="CheckCircle2" size={13} />
                Закрыл задач
              </div>
              <div className="text-2xl font-semibold">{stats.closedCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Icon name="Inbox" size={13} />
                Получил задач
              </div>
              <div className="text-2xl font-semibold">{stats.receivedCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Icon name="Clock" size={13} />
                Время в приложении
              </div>
              <div className="text-2xl font-semibold">{fmtDuration(stats.timeSpentSeconds)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Не удалось загрузить статистику</p>
        )}
      </div>
    </div>
  );
}
