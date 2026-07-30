import Icon from '@/components/ui/icon';
import type { RawColumn } from './patchesDdfShared';

// Раньше форма создания одной записи (не для isRawOnly-схем) собирала данные ТОЛЬКО из id-полей
// + editable-текстовых полей ({fieldName: value}, отправлялось как body.rows) — точно та же
// ошибка, что уже была найдена и исправлена в форме "Списком" (см. useDdfBulk.ts). Для схем с
// ДИНАМИЧЕСКИМИ МАССИВАМИ (actionname: cat2_cnt + связанный c[cat2_cnt] — значение массива
// реально используется игрой) поле массива вообще не заполнялось — при сборке бинарного файла
// массив писался пустым, что СДВИГАЕТ ПО БАЙТАМ все записи файла после вставленной и необратимо
// портит их (см. реальный инцидент — пользователь продублировал запись actionname id=56 → 57,
// все записи после неё в файле стали нечитаемым мусором). Теперь форма ВСЕГДА показывает единую
// табличную raw-форму (тот же формат, что ddf_get_raw/ddf_save_raw/PatchesDdfRawPanel.tsx) — под
// названием каждой колонки её значение, редактирование по отдельности, без риска потерять поле.
export default function PatchesDdfCreatePanel({
  loadingCreate,
  createRawLine,
  setCreateRawLine,
  createRawColumns,
  createIdFields,
  creating,
  createError,
  onSubmit,
}: {
  loadingCreate: boolean;
  createRawLine: string;
  setCreateRawLine: (v: string) => void;
  createRawColumns: RawColumn[];
  createIdFields: string[];
  creating: boolean;
  createError: string;
  onSubmit: () => void;
}) {
  const tokens = createRawLine.split('\t');
  const labels = createRawColumns.length === tokens.length
    ? createRawColumns.map((c) => c.label)
    : tokens.map((_, i) => String(i));
  const idLabels = new Set(createIdFields);

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
            Заполните нужные значения (остальные останутся значениями по умолчанию) и сохраните —
            новая запись добавится в файл.
            {idLabels.size > 0 && ' Поля, выделенные жёлтым — идентификатор записи, должны быть уникальными.'}
          </p>

          <div className="border border-border rounded-lg overflow-x-auto scrollbar-thin">
            <table className="border-collapse">
              <tbody>
                <tr>
                  {labels.map((label, i) => (
                    <td key={i} className={`px-2 py-1.5 text-[11px] font-medium border-b border-r border-border last:border-r-0 whitespace-nowrap ${idLabels.has(label) ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground bg-secondary/40'}`}>
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
                        className={`h-9 px-2 text-xs font-mono bg-background outline-none focus:bg-secondary/30 min-w-[60px] ${idLabels.has(labels[i]) ? 'ring-1 ring-inset ring-amber-500/40' : ''}`}
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
