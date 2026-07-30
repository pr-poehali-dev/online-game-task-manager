import Icon from '@/components/ui/icon';
import type { RangeRow } from './useDdfRange';

export default function PatchesDdfRangePanel({
  idFrom,
  setIdFrom,
  idTo,
  setIdTo,
  rangeRows,
  rangeTruncated,
  loadingRange,
  rangeError,
  rangeLoaded,
  onLoadRange,
  onOpenRow,
}: {
  idFrom: string;
  setIdFrom: (v: string) => void;
  idTo: string;
  setIdTo: (v: string) => void;
  rangeRows: RangeRow[];
  rangeTruncated: boolean;
  loadingRange: boolean;
  rangeError: string;
  rangeLoaded: boolean;
  onLoadRange: () => void;
  onOpenRow: (index: number) => void;
}) {
  const labels = rangeRows[0]?.columns.map((c) => c.label) || [];

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Покажет таблицей все записи, чей ID попадает в указанный диапазон.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">ID от</label>
          <input
            value={idFrom}
            onChange={(e) => setIdFrom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLoadRange()}
            inputMode="numeric"
            placeholder="1"
            className="w-28 h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">ID до</label>
          <input
            value={idTo}
            onChange={(e) => setIdTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLoadRange()}
            inputMode="numeric"
            placeholder="10"
            className="w-28 h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <button
          onClick={onLoadRange}
          disabled={loadingRange || !idFrom || !idTo}
          className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
        >
          <Icon name={loadingRange ? 'Loader2' : 'Table'} size={14} className={loadingRange ? 'animate-spin' : ''} />
          {loadingRange ? 'Загружаю...' : 'Показать'}
        </button>
      </div>

      {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}

      {rangeTruncated && (
        <p className="text-xs text-amber-500">Найдено больше записей, чем можно показать — уточните диапазон.</p>
      )}

      {rangeLoaded && rangeRows.length === 0 && !rangeError && (
        <p className="text-sm text-muted-foreground text-center py-8">В этом диапазоне записей не найдено</p>
      )}

      {rangeRows.length > 0 && (
        <div className="border border-border rounded-lg overflow-auto scrollbar-thin max-h-[60vh]">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                {labels.map((label, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-r border-border last:border-r-0 whitespace-nowrap bg-secondary/40 text-left sticky top-0"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rangeRows.map((r) => (
                <tr
                  key={r.index}
                  onClick={() => onOpenRow(r.index)}
                  className="cursor-pointer hover:bg-secondary/40 transition-colors"
                >
                  {r.columns.map((c, i) => (
                    <td key={i} className="px-2 py-1.5 text-xs font-mono border-b border-r border-border last:border-r-0 whitespace-nowrap">
                      {c.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
