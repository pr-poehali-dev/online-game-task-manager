import Icon from '@/components/ui/icon';
import type { Streamer, SessionFilters } from './streamersTypes';

interface Props {
  streamers: Streamer[];
  filters: SessionFilters;
  onChange: (patch: Partial<SessionFilters>) => void;
}

const FIELD = 'h-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary';

function isoDate(d: Date): string {
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  return msk.toISOString().slice(0, 10);
}

export default function StreamSessionsFilters({ streamers, filters, onChange }: Props) {
  const hasFilters = Boolean(filters.streamerId || filters.dateFrom || filters.dateTo);

  function quick(days: number) {
    const now = new Date();
    onChange({ dateFrom: isoDate(new Date(now.getTime() - (days - 1) * 86400000)), dateTo: isoDate(now) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
      <div className="relative">
        <Icon name="User" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          value={filters.streamerId}
          onChange={(e) => onChange({ streamerId: e.target.value })}
          className={`${FIELD} pl-8 pr-3 w-48`}
        >
          <option value="">Все стримеры</option>
          {streamers.map((s) => (
            <option key={s.id} value={s.id}>{s.displayName}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        С
        <input
          type="date"
          value={filters.dateFrom}
          max={filters.dateTo || undefined}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className={`${FIELD} px-2.5`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        по
        <input
          type="date"
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className={`${FIELD} px-2.5`}
        />
      </label>

      <div className="flex items-center gap-1">
        <button onClick={() => quick(1)} className="h-9 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">Сегодня</button>
        <button onClick={() => quick(7)} className="h-9 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">7 дней</button>
        <button onClick={() => quick(30)} className="h-9 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">30 дней</button>
      </div>

      {hasFilters && (
        <button
          onClick={() => onChange({ streamerId: '', dateFrom: '', dateTo: '' })}
          className="h-9 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <Icon name="X" size={12} />
          Сбросить
        </button>
      )}
    </div>
  );
}
