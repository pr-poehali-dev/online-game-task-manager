import Icon from '@/components/ui/icon';
import type { RawColumn } from './patchesDdfShared';

export default function PatchesDdfBulkPanel({
  loadingBulk,
  isRawOnly,
  bulkIdFields,
  bulkEditableFields,
  bulkTemplateLine,
  bulkRawColumns,
  bulkText,
  setBulkText,
  submittingBulk,
  bulkAdded,
  bulkError,
  onSubmit,
}: {
  loadingBulk: boolean;
  isRawOnly: boolean;
  bulkIdFields: string[];
  bulkEditableFields: string[];
  bulkTemplateLine: string;
  bulkRawColumns: RawColumn[];
  bulkText: string;
  setBulkText: (v: string) => void;
  submittingBulk: boolean;
  bulkAdded: number | null;
  bulkError: string;
  onSubmit: () => void;
}) {
  if (isRawOnly) {
    // raw-only схемы — нет отдельных "человеческих" полей, каждая строка списка это ГОТОВАЯ
    // запись целиком (таб-разделённые значения всех полей схемы в фиксированном порядке).
    // Даём пользователю стартовую строку-шаблон (со значениями по умолчанию), которую удобно
    // скопировать нужное число раз и точечно поправить значения в каждой копии.
    const columnNames = bulkRawColumns.map((c) => c.label).join('  ·  ');
    return (
      <div className="p-5">
        {loadingBulk ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              По одной записи на строку. У этого файла сложная структура — каждая строка должна содержать
              все значения через табуляцию, в том же порядке, что и колонки ниже. Проще всего скопировать
              строку-шаблон нужное число раз и поправить в каждой копии только нужные значения.
            </p>
            {columnNames && (
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Порядок колонок: {columnNames}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkText((bulkText ? bulkText + '\n' : '') + bulkTemplateLine)}
                className="h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors flex items-center gap-1.5"
              >
                <Icon name="Copy" size={12} />
                Добавить строку-шаблон
              </button>
            </div>
            <textarea
              autoFocus
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={bulkTemplateLine}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y min-h-[200px]"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={onSubmit}
                disabled={submittingBulk || !bulkText.trim()}
                className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
              >
                <Icon name={submittingBulk ? 'Loader2' : 'ListPlus'} size={14} className={submittingBulk ? 'animate-spin' : ''} />
                {submittingBulk ? 'Добавляю...' : 'Добавить все'}
              </button>
              {bulkAdded !== null && (
                <span className="text-sm text-emerald-500 flex items-center gap-1.5">
                  <Icon name="Check" size={14} /> Добавлено записей: {bulkAdded}
                </span>
              )}
              {bulkError && <span className="text-sm text-destructive">{bulkError}</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Пример/placeholder раньше был статичным текстом ("90001, Тестовый предмет, Описание
  // предмета") одинаковым для ЛЮБОГО файла — вводило в заблуждение, если у файла другой набор
  // полей (или их вообще нет, как у actionname: tag,id,cmd,icon,name,desc) либо нет понятия id
  // вовсе. Теперь пример строится из РЕАЛЬНЫХ полей открытого файла — по одному демонстрационному
  // значению на колонку, в правильном порядке (сначала id-поля, затем editable).
  const allColumnNames = [...bulkIdFields, ...bulkEditableFields];
  const exampleRow = allColumnNames.map((name, i) => (
    bulkIdFields.includes(name) ? String(90001 + i) : `${name} 1`
  ));
  const exampleLine = exampleRow.join(', ');
  const placeholderLine1 = allColumnNames.map((name) => (
    bulkIdFields.includes(name) ? '90001' : `${name} 1`
  )).join('\t');
  const placeholderLine2 = allColumnNames.map((name) => (
    bulkIdFields.includes(name) ? '90002' : `${name} 2`
  )).join('\t');

  return (
    <div className="p-5">
      {loadingBulk ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            По одной записи на строку. Вставьте значения через табуляцию (как при копировании из Excel/Google Таблиц)
            или через запятую — {bulkIdFields.length > 0 && <>сначала <strong>{bulkIdFields.join(', ')}</strong>, затем: </>}
            {bulkEditableFields.join(', ') || (bulkIdFields.length === 0 ? 'у этого файла нет текстовых полей для правки' : '—')}.
          </p>
          {allColumnNames.length > 0 && (
            <p className="text-xs text-muted-foreground/80">
              Пример: <code className="px-1 py-0.5 rounded bg-secondary">{exampleLine}</code>
            </p>
          )}
          <textarea
            autoFocus
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            placeholder={allColumnNames.length > 0 ? `${placeholderLine1}\n${placeholderLine2}` : ''}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y min-h-[200px]"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={onSubmit}
              disabled={submittingBulk || !bulkText.trim()}
              className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
            >
              <Icon name={submittingBulk ? 'Loader2' : 'ListPlus'} size={14} className={submittingBulk ? 'animate-spin' : ''} />
              {submittingBulk ? 'Добавляю...' : 'Добавить все'}
            </button>
            {bulkAdded !== null && (
              <span className="text-sm text-emerald-500 flex items-center gap-1.5">
                <Icon name="Check" size={14} /> Добавлено записей: {bulkAdded}
              </span>
            )}
            {bulkError && <span className="text-sm text-destructive">{bulkError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}