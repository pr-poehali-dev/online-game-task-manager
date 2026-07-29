import Icon from '@/components/ui/icon';
import type { FieldDef, RawColumn } from './patchesDdfShared';

export default function PatchesDdfCreatePanel({
  loadingCreate,
  isRawOnly,
  createFields,
  createValues,
  setCreateValues,
  createRawLine,
  setCreateRawLine,
  createRawColumns,
  creating,
  createError,
  onSubmit,
}: {
  loadingCreate: boolean;
  isRawOnly: boolean;
  createFields: FieldDef[];
  createValues: Record<string, string>;
  setCreateValues: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  createRawLine: string;
  setCreateRawLine: (v: string) => void;
  createRawColumns: RawColumn[];
  creating: boolean;
  createError: string;
  onSubmit: () => void;
}) {
  if (isRawOnly) {
    // raw-only схемы (armorgrp/etcitemgrp/recipe и т.п.) — нет отдельных "человеческих" полей,
    // редактируем пустой шаблон записи целиком той же табличной формой, что и обычный просмотр
    // (см. PatchesDdfRawPanel) — под названием каждой колонки указано текущее значение.
    const tokens = createRawLine.split('\t');
    const labels = createRawColumns.length === tokens.length
      ? createRawColumns.map((c) => c.label)
      : tokens.map((_, i) => String(i));

    function setTokenAt(index: number, value: string) {
      const next = [...tokens];
      next[index] = value;
      setCreateRawLine(next.join('\t'));
    }

    return (
      <div className="p-5">
        {loadingCreate ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              У этого файла сложная структура записи — заполните нужные значения (остальные останутся значениями
              по умолчанию) и сохраните, новая запись добавится в конец файла.
            </p>

            <div className="border border-border rounded-lg overflow-x-auto scrollbar-thin">
              <table className="border-collapse">
                <tbody>
                  <tr>
                    {labels.map((label, i) => (
                      <td key={i} className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-r border-border last:border-r-0 whitespace-nowrap bg-secondary/40">
                        {label}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {tokens.map((token, i) => (
                      <td key={i} className="p-0 border-r border-border last:border-r-0">
                        <input
                          value={token}
                          onChange={(e) => setTokenAt(i, e.target.value)}
                          spellCheck={false}
                          className="h-9 px-2 text-xs font-mono bg-background outline-none focus:bg-secondary/30 min-w-[60px]"
                          style={{ width: `${Math.max(60, Math.min(240, token.length * 7 + 20))}px` }}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onSubmit}
                disabled={creating}
                className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
              >
                <Icon name={creating ? 'Loader2' : 'Plus'} size={14} className={creating ? 'animate-spin' : ''} />
                {creating ? 'Создаю...' : 'Создать запись'}
              </button>
              {createError && <span className="text-sm text-destructive">{createError}</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5">
      {loadingCreate ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Заполните поля новой записи и сохраните — она добавится в конец файла.</p>
          <div className="grid grid-cols-2 gap-3">
            {createFields.filter((f) => !f.array && !f.editable).map((f) => (
              <div key={f.name}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.name}</label>
                <input
                  value={createValues[f.name] ?? ''}
                  onChange={(e) => setCreateValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                />
              </div>
            ))}
          </div>

          {createFields.filter((f) => f.editable).map((f) => (
            <div key={f.name}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.name}</label>
              <textarea
                value={createValues[f.name] ?? ''}
                onChange={(e) => setCreateValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                rows={(createValues[f.name]?.length ?? 0) > 80 ? 4 : 1}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y min-h-[38px]"
              />
            </div>
          ))}

          {createFields.some((f) => f.array) && (
            <p className="text-xs text-muted-foreground">
              Табличные поля этой схемы будут заполнены значениями по умолчанию — их можно донастроить позже при необходимости.
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onSubmit}
              disabled={creating}
              className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
            >
              <Icon name={creating ? 'Loader2' : 'Plus'} size={14} className={creating ? 'animate-spin' : ''} />
              {creating ? 'Создаю...' : 'Создать запись'}
            </button>
            {createError && <span className="text-sm text-destructive">{createError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}