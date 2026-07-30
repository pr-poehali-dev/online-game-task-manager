import Icon from '@/components/ui/icon';
import type { RawColumn } from './patchesDdfShared';

// Раньше форма массового добавления по-разному собирала данные для isRawOnly-схем (armorgrp/
// etcitemgrp/recipe — целая таб-строка, отправлялась как rawLines) и обычных схем (только
// id-поля + editable-текстовые поля, собирались в {fieldName: value} и отправлялись как rows).
// Второй путь ломался на ЛЮБОЙ обычной схеме, у которой есть ДРУГИЕ значимые поля помимо
// id/editable-текста — нередактируемые скаляры (creditgrp: time/align) или динамические массивы
// (actionname: cat2_cnt + связанный c[cat2_cnt], значение которого реально используется игрой) —
// эти поля молча получали 0, а подсказка на экране не совпадала с реальной структурой записи
// (см. реальные скриншоты пользователя: raw-режим показывает 10 колонок, включая c[0], форма
// "Списком" просила заполнить только 9 — без c[0]).
//
// Теперь ОБЕ ветки используют один и тот же raw-формат (тот же, что ddf_get_raw/ddf_save_raw —
// таб-разделённые значения ВСЕХ полей схемы, включая развёрнутые массивы/MTX/MAT, см. ddf_raw.py)
// — гарантированно совпадает 1:1 со структурой, которую видно при просмотре существующей записи
// в raw-режиме, для любой схемы без исключений.
export default function PatchesDdfBulkPanel({
  loadingBulk,
  bulkIdFields,
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
  bulkIdFields: string[];
  bulkTemplateLine: string;
  bulkRawColumns: RawColumn[];
  bulkText: string;
  setBulkText: (v: string) => void;
  submittingBulk: boolean;
  bulkAdded: number | null;
  bulkError: string;
  onSubmit: () => void;
}) {
  const columnNames = bulkRawColumns.map((c) => c.label).join('  ·  ');
  const idLabels = new Set(bulkIdFields);

  return (
    <div className="p-5">
      {loadingBulk ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            По одной записи на строку. Каждая строка должна содержать все значения через табуляцию,
            в том же порядке, что и колонки ниже. Проще всего скопировать строку-шаблон нужное число раз
            и поправить в каждой копии только нужные значения.
          </p>
          {columnNames && (
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Порядок колонок: {bulkRawColumns.map((c, i) => (
                <span key={i} className={idLabels.has(c.label) ? 'text-amber-500 font-medium' : ''}>
                  {i > 0 && '  ·  '}{c.label}
                </span>
              ))}
              {bulkIdFields.length > 0 && ' (выделено — идентификатор записи, должен быть уникальным)'}
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