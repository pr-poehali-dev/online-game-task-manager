import Icon from '@/components/ui/icon';
import type { RawColumn } from './patchesDdfShared';

export default function PatchesDdfBulkPanel({
  loadingBulk,
  isRawOnly,
  bulkIdField,
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
  bulkIdField: string | undefined;
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
            или через запятую — сначала <strong>{bulkIdField}</strong>, затем: {bulkEditableFields.join(', ') || '—'}.
          </p>
          <p className="text-xs text-muted-foreground/80">
            Пример: <code className="px-1 py-0.5 rounded bg-secondary">90001, Тестовый предмет, Описание предмета</code>
          </p>
          <textarea
            autoFocus
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            placeholder={`90001\tНазвание 1\tОписание 1\n90002\tНазвание 2\tОписание 2`}
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