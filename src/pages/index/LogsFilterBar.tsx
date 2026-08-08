import Icon from '@/components/ui/icon';
import type { ServerItem } from '@/lib/catalog';
import type { ServerId } from './shared';
import { LOG_TYPES, fmtDateTime } from './LogsTypes';
import type { LogType, Coverage } from './LogsTypes';

interface LogsFilterBarProps {
  servers: ServerItem[];
  activeId: string;
  onSelectServer: (id: ServerId) => void;
  logType: LogType;
  onSelectLogType: (type: LogType) => void;
  coverageLoading: boolean;
  coverageError: string;
  coverage: Coverage | null;
  playerFilter: string;
  onPlayerFilterChange: (value: string) => void;
  itemFilter: string;
  onItemFilterChange: (value: string) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  timeFrom: string;
  onTimeFromChange: (value: string) => void;
  timeTo: string;
  onTimeToChange: (value: string) => void;
  onApplyFilters: () => void;
  totalMatched: number;
}

export default function LogsFilterBar({
  servers,
  activeId,
  onSelectServer,
  logType,
  onSelectLogType,
  coverageLoading,
  coverageError,
  coverage,
  playerFilter,
  onPlayerFilterChange,
  itemFilter,
  onItemFilterChange,
  actionFilter,
  onActionFilterChange,
  timeFrom,
  onTimeFromChange,
  timeTo,
  onTimeToChange,
  onApplyFilters,
  totalMatched,
}: LogsFilterBarProps) {
  return (
    <>
      {/* Выбор сервера */}
      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-4 w-fit flex-wrap">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectServer(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeId === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: activeId === s.id ? 'currentColor' : `hsl(${s.color})` }} />
            {s.label}
          </button>
        ))}
        {servers.length === 0 && (
          <span className="text-xs text-muted-foreground px-2 py-1.5">Серверов пока нет</span>
        )}
      </div>

      {/* Выбор типа лога */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {LOG_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectLogType(t.id)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              logType === t.id ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-secondary/40'
            }`}
          >
            <div className={`text-sm font-medium ${logType === t.id ? 'text-primary' : 'text-foreground'}`}>{t.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.hint}</div>
          </button>
        ))}
      </div>

      {/* Сверка наличия логов на VPS */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Icon name="History" size={13} className="text-muted-foreground shrink-0" />
        {coverageLoading ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Icon name="Loader2" size={12} className="animate-spin" />
            Проверка наличия логов на сервере…
          </span>
        ) : coverageError ? (
          <span className="text-xs text-destructive flex items-center gap-1.5">
            <Icon name="AlertCircle" size={12} />
            {coverageError}
          </span>
        ) : coverage && !coverage.available ? (
          <span className="text-xs text-muted-foreground">Логов этого типа на сервере пока нет</span>
        ) : coverage ? (
          <span className="text-xs text-muted-foreground">
            Логи есть с <span className="text-foreground font-medium">{fmtDateTime(coverage.from!)}</span> по{' '}
            <span className="text-foreground font-medium">{fmtDateTime(coverage.to!)}</span>
            {' '}({coverage.fileCount} {coverage.fileCount === 1 ? 'файл' : 'файла'})
          </span>
        ) : null}
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
        <div className="relative">
          <Icon name="User" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={playerFilter}
            onChange={(e) => onPlayerFilterChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApplyFilters(); }}
            placeholder="Игрок или ник"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-44 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Package" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={itemFilter}
            onChange={(e) => onItemFilterChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApplyFilters(); }}
            placeholder="Предмет"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Zap" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={actionFilter}
            onChange={(e) => onActionFilterChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApplyFilters(); }}
            placeholder="Действие"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="Calendar" size={13} className="text-muted-foreground shrink-0" />
          <input
            type="datetime-local"
            step="1"
            value={timeFrom}
            onChange={(e) => onTimeFromChange(e.target.value)}
            className="h-9 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="datetime-local"
            step="1"
            value={timeTo}
            onChange={(e) => onTimeToChange(e.target.value)}
            className="h-9 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={onApplyFilters}
          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Icon name="Search" size={14} />
          Найти
        </button>
        {totalMatched > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">Найдено: {totalMatched}</span>
        )}
      </div>
    </>
  );
}
