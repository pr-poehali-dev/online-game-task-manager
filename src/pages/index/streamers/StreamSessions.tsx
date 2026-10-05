import Icon from '@/components/ui/icon';
import StreamSessionsFilters from './StreamSessionsFilters';
import StreamSessionsTable from './StreamSessionsTable';
import { useStreamSessions } from './useStreamSessions';
import type { Streamer } from './streamersTypes';

interface Props {
  active: boolean;
  streamers: Streamer[];
}

export default function StreamSessions({ active, streamers }: Props) {
  const { filters, changeFilters, sort, dir, toggleSort, page, setPage, totalPages, total, sessions, loading, error } = useStreamSessions(active);

  return (
    <div>
      <StreamSessionsFilters streamers={streamers} filters={filters} onChange={changeFilters} />

      {error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive flex items-center gap-2">
          <Icon name="AlertCircle" size={15} />
          {error}
        </div>
      ) : loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Icon name="Loader2" size={16} className="animate-spin" />
          Загрузка…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {filters.streamerId || filters.dateFrom || filters.dateTo
            ? 'По выбранным фильтрам эфиров нет'
            : 'Эфиров пока нет. Они появятся, когда добавленные стримеры начнут трансляцию'}
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <StreamSessionsTable sessions={sessions} sort={sort} dir={dir} onSort={toggleSort} />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">Всего эфиров: {total}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Icon name="ChevronLeft" size={14} />
                </button>
                <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Icon name="ChevronRight" size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
