import { useState } from 'react';
import { postJson } from './patchesApi';
import type { Mode, RawColumn } from './patchesDdfShared';
import type { ServerId } from './shared';

// Форма массового добавления ("Списком") раньше по-разному собирала запись для isRawOnly-схем
// (raw-строка целиком — надёжно) и обычных схем (только id-поля + editable-текст, собранные в
// {fieldName: value} — ненадёжно). Второй путь несколько раз ломался на реальных данных:
//   1) id-поле угадывалось как "первое нередактируемое поле" — ошибка на схемах со служебным
//      полем перед настоящим id (actionname: tag, id, ...).
//   2) даже после исправления (1) — прочие нередактируемые скалярные поля вне id (creditgrp:
//      time/align) вообще не собирались и молча становились нулём.
//   3) даже после исправления (2) — динамические массивы (actionname: cat2_cnt + связанный
//      c[cat2_cnt], реально используемое игрой значение) исключались из формы сознательно —
//      подсказка на экране (9 колонок) не совпадала с реальной структурой записи в raw-режиме
//      (10 колонок, включая c[0]) — см. репорт пользователя со скриншотами.
// Корень проблемы — попытка вручную реализовать на фронте то же самое, что уже умеет делать
// raw-формат (ddf_raw.py: row_to_raw_line/raw_line_to_row), который разворачивает АБСОЛЮТНО ВСЕ
// поля схемы, включая массивы/MTX/MAT, в фиксированном порядке. Теперь ОБЕ ветки (isRawOnly и
// обычная схема) используют этот единственный, уже проверенный формат — see backend ddf_new
// (всегда возвращает rawLine/rawColumns) и ddf_create (rawLines принимается для любой схемы).
export function useDdfBulk(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  query: string,
  runSearch: (q: string) => Promise<void>,
) {
  const [bulkText, setBulkText] = useState('');
  const [bulkTemplateLine, setBulkTemplateLine] = useState('');
  const [bulkRawColumns, setBulkRawColumns] = useState<RawColumn[]>([]);
  const [bulkIdFields, setBulkIdFields] = useState<string[]>([]);
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkAdded, setBulkAdded] = useState<number | null>(null);

  async function openBulk() {
    setMode('bulk');
    setLoadingBulk(true);
    setBulkError('');
    setBulkAdded(null);
    setBulkText('');
    try {
      const data = await postJson({ action: 'ddf_new', server, path });
      const idFields: string[] = data.idFields || [];
      setBulkIdFields(idFields);
      // ddf_new отдаёт "пустой" шаблон (все поля — 0/''), собранный из значений по умолчанию —
      // для схем с ДИНАМИЧЕСКИМИ МАССИВАМИ (actionname: cat2_cnt/c[cat2_cnt]) пустой шаблон
      // имеет cat2_cnt=0, из-за чего связанный массив c[] оказывается пустым и колонка c[0]
      // просто ИСЧЕЗАЕТ из шаблона — хотя у реальных записей файла cat2_cnt почти всегда 1, и
      // c[0] присутствует. Подсказка "9 колонок" не совпадала с реальной структурой записи в
      // raw-режиме (10 колонок) — см. скриншоты пользователя. Вместо пустого шаблона берём за
      // основу ПЕРВУЮ РЕАЛЬНУЮ запись файла (тот же формат, что видно при просмотре/правке
      // существующей записи текстом) — гарантированно правильное число колонок для количества
      // элементов массивов, которое реально используется в файле. Id-поля в шаблоне очищаем
      // (та же логика, что и в "Дублировать" — иначе шаблон стартовал бы с гарантированным
      // конфликтом дубликата). Если в файле вообще нет записей — используем пустой шаблон
      // от ddf_new как есть (первой реальной записи просто не существует).
      try {
        const sample = await postJson({ action: 'ddf_get_raw', server, path, index: 0 });
        const columns: RawColumn[] = sample.columns || [];
        const tokens = (sample.line as string).split('\t');
        const labels = columns.map((c) => c.label);
        for (const idName of idFields) {
          const i = labels.indexOf(idName);
          if (i !== -1) tokens[i] = '';
        }
        setBulkTemplateLine(tokens.join('\t'));
        setBulkRawColumns(columns);
      } catch {
        setBulkTemplateLine(data.rawLine ?? '');
        setBulkRawColumns(data.rawColumns || []);
      }
    } catch {
      setBulkError('Не удалось загрузить схему файла');
    } finally {
      setLoadingBulk(false);
    }
  }

  async function handleBulkSubmit() {
    setSubmittingBulk(true);
    setBulkError('');
    setBulkAdded(null);
    try {
      const lines = bulkText.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setBulkError('Вставьте хотя бы одну строку');
        setSubmittingBulk(false);
        return;
      }
      // Каждая строка — уже готовая таб-разделённая запись целиком (пользователь копирует и
      // правит несколько копий строки-шаблона) — отправляем как есть, без разбора на поля.
      const data = await postJson({ action: 'ddf_create', server, path, rawLines: lines });
      setBulkAdded(data.added || lines.length);
      setBulkText('');
      runSearch(query);
    } catch {
      setBulkError('Не удалось добавить записи — проверьте формат и попробуйте ещё раз');
    } finally {
      setSubmittingBulk(false);
    }
  }

  return {
    bulkText,
    setBulkText,
    bulkTemplateLine,
    bulkRawColumns,
    bulkIdFields,
    loadingBulk,
    submittingBulk,
    bulkError,
    bulkAdded,
    openBulk,
    handleBulkSubmit,
  };
}