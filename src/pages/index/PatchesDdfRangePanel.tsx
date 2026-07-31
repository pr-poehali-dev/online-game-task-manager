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
  canManage,
  savingRows,
  savedRows,
  rowErrors,
  dirtyRows,
  savingAll,
  saveAllError,
  onLoadRange,
  onCellChange,
  onSaveAll,
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
  canManage: boolean;
  savingRows: Record<number, boolean>;
  savedRows: Record<number, boolean>;
  rowErrors: Record<number, string>;
  dirtyRows: Record<number, boolean>;
  savingAll: boolean;
  saveAllError: string;
  onLoadRange: () => void;
  onCellChange: (recordIndex: number, colIndex: number, value: string) => void;
  onSaveAll: () => void;
}) {
  const labels = rangeRows[0]?.columns.map((c) => c.label) || [];
  const hasDirty = Object.values(dirtyRows).some(Boolean);

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Покажет таблицей все записи, чей ID попадает в указанный диапазон — правьте значения прямо в ячейках
        и сохраните все изменения одной кнопкой.
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
        <>
          <div className="border border-border rounded-lg overflow-auto scrollbar-thin max-h-[60vh]">
            <table className="border-collapse w-full">
              <thead>
                <tr>
                  <th className="w-8 border-b border-r border-border bg-secondary/40 sticky top-0" />
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
                {rangeRows.map((r) => {
                  const saving = !!savingRows[r.index];
                  const saved = !!savedRows[r.index];
                  const rowError = rowErrors[r.index];
                  return (
                    <tr key={r.index}>
                      <td className="p-0 border-r border-border text-center align-middle" title={rowError || (saved ? 'Сохранено' : '')}>
                        {saving ? (
                          <Icon name="Loader2" size={12} className="animate-spin text-muted-foreground mx-auto" />
                        ) : rowError ? (
                          <Icon name="AlertCircle" size={12} className="text-destructive mx-auto" />
                        ) : saved ? (
                          <Icon name="Check" size={12} className="text-emerald-500 mx-auto" />
                        ) : null}
                      </td>
                      {r.columns.map((c, i) => (
                        <td key={i} className="p-0 border-r border-border last:border-r-0">
                          <input
                            value={c.value}
                            onChange={(e) => onCellChange(r.index, i, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onSaveAll()}
                            disabled={!canManage || saving}
                            spellCheck={false}
                            className="h-9 px-2 text-xs font-mono bg-background disabled:opacity-70 outline-none focus:bg-secondary/30 min-w-[60px]"
                            style={{ width: `${Math.max(60, Math.min(240, c.value.length * 7 + 20))}px` }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canManage && (
            <div className="flex items-center gap-3">
              <button
                onClick={onSaveAll}
                disabled={savingAll || !hasDirty}
                className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
              >
                <Icon name={savingAll ? 'Loader2' : 'Save'} size={14} className={savingAll ? 'animate-spin' : ''} />
                {savingAll ? 'Сохраняю...' : 'Сохранить изменения'}
              </button>
              {saveAllError && <span className="text-sm text-destructive">{saveAllError}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}