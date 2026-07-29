import { useState } from 'react';
import { postJson } from './patchesApi';
import type { FieldDef, RowValue, Mode, RawColumn } from './patchesDdfShared';
import { cleanText } from './patchesDdfShared';
import type { ServerId } from './shared';

export function useDdfCreate(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  setQuery: (q: string) => void,
  runSearch: (q: string) => Promise<void>,
  isRawOnlySchema: boolean,
  idFields: string[],
  rawColumns: RawColumn[],
  rawLine: string | null,
  row: Record<string, RowValue> | null,
  fields: FieldDef[],
) {
  const [createFields, setCreateFields] = useState<FieldDef[]>([]);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [createRawLine, setCreateRawLine] = useState('');
  const [createRawColumns, setCreateRawColumns] = useState<RawColumn[]>([]);
  const [createIdFields, setCreateIdFields] = useState<string[]>([]);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function openCreate() {
    setMode('create');
    setLoadingCreate(true);
    setCreateError('');
    try {
      const data = await postJson({ action: 'ddf_new', server, path });
      setCreateIdFields(data.idFields || []);
      if (data.isRawOnly) {
        // raw-only схемы (armorgrp/etcitemgrp/recipe и т.п.) не имеют отдельных "человеческих"
        // полей — форма создания показывает ту же таб-строку целиком, что и обычный просмотр
        // записи (ddf_get_raw), стартуя с пустого шаблона по умолчанию (см. ddf_new в index.py).
        setCreateRawLine(data.rawLine ?? '');
        setCreateRawColumns(data.rawColumns || []);
        setCreateFields([]);
      } else {
        const flds: FieldDef[] = data.fields || [];
        setCreateFields(flds);
        const initial: Record<string, string> = {};
        for (const f of flds) {
          if (f.array) continue;
          initial[f.name] = cleanText(data.row?.[f.name]);
        }
        setCreateValues(initial);
      }
    } catch {
      setCreateError('Не удалось загрузить форму создания');
    } finally {
      setLoadingCreate(false);
    }
  }

  // «Дублировать» — открывает ту же форму "создать новую запись", но предзаполненную значениями
  // ТЕКУЩЕЙ открытой записи (обычной или raw), а не пустым шаблоном (в отличие от openCreate).
  // id-поля (см. idFields/_ID_FIELDS в ddf_registry*.py) намеренно ОЧИЩАЮТСЯ (не копируются) —
  // иначе форма стартовала бы уже с гарантированным конфликтом дубликата, который backend всё
  // равно заблокирует при сохранении (см. ddf_create/_ddf_check_duplicate_key в index.py) —
  // пользователю проще сразу увидеть пустое поле id и вписать новое значение, чем сначала
  // получить ошибку "уже существует" и только потом сообразить, что нужно поменять именно id.
  //
  // Решение "какую форму открыть" опирается на isRawOnlySchema (та же логика, что и
  // handleCreateSubmit — раз схема raw-only, отправка ВСЕГДА идёт через rawLines), а НЕ на
  // текущий isRawMode — пользователь мог вручную переключить ОБЫЧНУЮ запись в текстовый вид
  // через toggleRawView, но row/fields при этом остаются последними загруженными данными
  // обычной формы (toggleRawView их не очищает при переходе в raw) — этого достаточно.
  function openDuplicate() {
    setMode('create');
    setCreateError('');
    setCreateIdFields(idFields);
    if (isRawOnlySchema) {
      setCreateRawColumns(rawColumns);
      if (rawLine !== null && idFields.length && rawColumns.length) {
        const tokens = rawLine.split('\t');
        const labels = rawColumns.map((c) => c.label);
        for (const idName of idFields) {
          const i = labels.indexOf(idName);
          if (i !== -1) tokens[i] = '';
        }
        setCreateRawLine(tokens.join('\t'));
      } else {
        setCreateRawLine(rawLine ?? '');
      }
      setCreateFields([]);
    } else {
      setCreateFields(fields);
      const initial: Record<string, string> = {};
      for (const f of fields) {
        if (f.array) continue;
        initial[f.name] = idFields.includes(f.name) ? '' : cleanText(row?.[f.name] ?? null);
      }
      setCreateValues(initial);
    }
  }

  async function handleCreateSubmit() {
    setCreating(true);
    setCreateError('');
    try {
      if (isRawOnlySchema) {
        await postJson({ action: 'ddf_create', server, path, rawLines: [createRawLine] });
      } else {
        const rowPayload: Record<string, string> = {};
        for (const f of createFields) {
          if (f.array) continue;
          rowPayload[f.name] = createValues[f.name] ?? '';
        }
        await postJson({ action: 'ddf_create', server, path, rows: [rowPayload] });
      }
      setMode('search');
      setQuery('');
      await runSearch('');
    } catch {
      setCreateError('Не удалось создать запись — проверьте значения полей');
    } finally {
      setCreating(false);
    }
  }

  return {
    createFields,
    createValues,
    setCreateValues,
    createRawLine,
    setCreateRawLine,
    createRawColumns,
    createIdFields,
    loadingCreate,
    creating,
    createError,
    openCreate,
    openDuplicate,
    handleCreateSubmit,
  };
}
