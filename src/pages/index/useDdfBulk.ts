import { useState } from 'react';
import { postJson } from './patchesApi';
import type { FieldDef, Mode, RawColumn } from './patchesDdfShared';
import type { ServerId } from './shared';

export function useDdfBulk(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  query: string,
  runSearch: (q: string) => Promise<void>,
  isRawOnlySchema: boolean,
) {
  const [bulkFields, setBulkFields] = useState<FieldDef[]>([]);
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
      // idFields (см. _ID_FIELDS в ddf_registry*.py) — ЕДИНСТВЕННО верный источник имени
      // id-поля(ей) схемы. Раньше id-поле угадывалось как "первое нередактируемое поле"
      // (bulkFields.find(f => !f.array && !f.editable)) — это ломалось на схемах со служебным
      // полем ПЕРЕД настоящим id (например actionname-e.dat: tag, id, ...) — первое значение
      // вставленной строки (например "90001") записывалось в служебный tag, а настоящий id
      // оставался равным 0, из-за чего разные строки списка молча схлопывались в одну запись
      // с id=0 (дубликат конфликтовал бы, но проверка на дубликаты шла по НЕПРАВИЛЬНОМУ полю).
      setBulkIdFields(data.idFields || []);
      if (data.isRawOnly) {
        // Шаблонная строка используется как подсказка/заготовка формата — каждая строка списка
        // должна иметь ровно столько же таб-разделённых значений, в том же порядке.
        setBulkTemplateLine(data.rawLine ?? '');
        setBulkRawColumns(data.rawColumns || []);
        setBulkFields([]);
      } else {
        setBulkFields(data.fields || []);
      }
    } catch {
      setBulkError('Не удалось загрузить схему файла');
    } finally {
      setLoadingBulk(false);
    }
  }

  // ВСЕ скалярные (не табличные — f.array=false) поля схемы, в порядке DDF-описания — не только
  // id и editable-текстовые. Раньше форма собирала запись ТОЛЬКО из id-поля(ей) + editable-полей
  // (bulkEditableFields), полностью игнорируя прочие нередактируемые скалярные поля схемы —
  // например у creditgrp это id, html(editable), image(editable), time, align: колонки time и
  // align вообще не запрашивались у пользователя и молча становились нулём в каждой добавленной
  // записи (см. реальный скриншот пользователя: raw-режим существующей записи показывает 5
  // значений — id/html/image/time/align, а форма "Списком" просила заполнить только 3). Табличные
  // поля (f.array=true, счётчики вроде cat2_cnt/c[] у actionname) по-прежнему не запрашиваются —
  // они получают значения по умолчанию, донастроить их можно позже через обычное редактирование.
  const bulkPlainFields = bulkFields.filter((f) => !f.array).map((f) => f.name);
  const bulkEditableFields = bulkFields.filter((f) => f.editable).map((f) => f.name);

  async function handleBulkSubmit() {
    if (!isRawOnlySchema && bulkPlainFields.length === 0) return;
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
      let data;
      if (isRawOnlySchema) {
        // Каждая строка — уже готовая taб-разделённая запись целиком (пользователь копирует и
        // правит несколько копий шаблонной строки) — отправляем как есть, без разбора на поля.
        data = await postJson({ action: 'ddf_create', server, path, rawLines: lines });
      } else {
        const hasTab = bulkText.includes('\t');
        const rows = lines.map((line) => {
          const parts = (hasTab ? line.split('\t') : line.split(',')).map((p) => p.trim());
          const rowPayload: Record<string, string> = {};
          // Значения строки — по одному на КАЖДОЕ скалярное поле схемы, в том же порядке, что и
          // bulkPlainFields (id-поля, прочие нередактируемые числа, затем editable-текст) —
          // backend (ddf_create) сам разберёт, какие из них текстовые, а какие числовые/float.
          bulkPlainFields.forEach((name, i) => {
            rowPayload[name] = parts[i] ?? '';
          });
          return rowPayload;
        });
        data = await postJson({ action: 'ddf_create', server, path, rows });
      }
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
    bulkFields,
    bulkText,
    setBulkText,
    bulkTemplateLine,
    bulkRawColumns,
    bulkIdFields,
    bulkPlainFields,
    loadingBulk,
    submittingBulk,
    bulkError,
    bulkAdded,
    bulkEditableFields,
    openBulk,
    handleBulkSubmit,
  };
}