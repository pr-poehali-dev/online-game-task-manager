import Icon from '@/components/ui/icon';
import type { SearchResult } from './patchesDdfShared';

export default function PatchesDdfSearchPanel({
  query,
  setQuery,
  searching,
  searchError,
  results,
  canManage,
  isRawOnly,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenRow,
  onOpenCreate,
  onOpenBulk,
}: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  searchError: string;
  results: SearchResult[];
  canManage: boolean;
  isRawOnly: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenRow: (index: number) => void;
  onOpenCreate: () => void;
  onOpenBulk: () => void;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, описанию или ID..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
          />
          {searching && (
            <Icon name="Loader2" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
        </div>
        {canManage && (
          <>
            <button
              onClick={onOpenCreate}
              title={isRawOnly ? 'Создать новую запись (текстом, у файла сложная структура)' : 'Создать новую запись'}
              className="h-10 px-3 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Icon name="Plus" size={15} />
              <span className="hidden sm:inline">Создать</span>
            </button>
            <button
              onClick={onOpenBulk}
              title={isRawOnly ? 'Добавить несколько записей списком (текстом, у файла сложная структура)' : 'Добавить несколько записей списком'}
              className="h-10 px-3 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Icon name="ListPlus" size={15} />
              <span className="hidden sm:inline">Списком</span>
            </button>
          </>
        )}
      </div>

      {searchError && <p className="text-sm text-destructive mb-3">{searchError}</p>}

      <div>
        {results.length === 0 && !searching && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? 'Ничего не найдено' : 'Начните вводить запрос или выберите запись из списка'}
          </p>
        )}
        {results.map((r) => (
          <button
            key={r.index}
            onClick={() => onOpenRow(r.index)}
            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors flex items-center gap-3 group"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{r.preview || r.label}</div>
              {r.preview && <div className="text-xs text-muted-foreground truncate">{r.label}</div>}
            </div>
            <Icon name="ChevronRight" size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full mt-1 h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Icon name={loadingMore ? 'Loader2' : 'ChevronDown'} size={14} className={loadingMore ? 'animate-spin' : ''} />
            {loadingMore ? 'Загружаю...' : 'Показать ещё'}
          </button>
        )}
      </div>
    </div>
  );
}