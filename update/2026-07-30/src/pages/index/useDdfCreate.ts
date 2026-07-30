import { useState } from 'react';
import { postJson } from './patchesApi';
import type { Mode, RawColumn } from './patchesDdfShared';
import type { ServerId } from './shared';

// ВАЖНО (см. реальный инцидент с actionname-e.dat, скриншоты пользователя): раньше эта форма
// собирала новую запись ТОЛЬКО из id-полей + editable-текстовых полей ({fieldName: value},
// отправлялось как body.rows) — точно та же ошибка, что была в форме "Списком" (см. useDdfBulk.ts).
// Для схем с ДИНАМИЧЕСКИМИ МАССИВАМИ (actionname: cat2_cnt + связанный c[cat2_cnt] — значение
// массива реально используется игрой, не всегда 0) поле массива вообще не заполнялось и не
// отправлялось на backend — при сборке бинарного файла (_write_field) массив писался пустым, что
// СДВИГАЕТ ПО БАЙТАМ все записи файла после вставленной, необратимо портя оставшуюся часть файла
// (records после нового id физически стали нечитаемым мусором, хотя totalRows в заголовке не
// изменился). Теперь форма ВСЕГДА использует raw-формат (тот же, что ddf_get_raw/ddf_save_raw и
// уже переведённая на него форма "Списком" — см. useDdfBulk.ts) — таб-строка со ВСЕМИ полями
// схемы, включая развёрнутые массивы/MTX/MAT, гарантированно без потерь полей.
export function useDdfCreate(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  setQuery: (q: string) => void,
  runSearch: (q: string) => Promise<void>,
  idFields: string[],
  selectedIndex: number | null,
) {
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
      const ids: string[] = data.idFields || [];
      setCreateIdFields(ids);
      // ddf_new отдаёт "пустой" шаблон (все поля — 0/'') — для схем с динамическими массивами
      // пустой шаблон имеет счётчик=0, из-за чего сам массив пустой и часть колонок в шаблоне
      // просто отсутствует. Берём за основу ПЕРВУЮ РЕАЛЬНУЮ запись файла (как уже сделано в
      // useDdfBulk.ts) — гарантированно правильное число колонок. Id-поля в шаблоне очищаем
      // (в отличие от формы "Списком") — иначе форма стартовала бы с гарантированным конфликтом
      // дубликата, который backend всё равно заблокирует при сохранении.
      try {
        const sample = await postJson({ action: 'ddf_get_raw', server, path, index: 0 });
        const columns: RawColumn[] = sample.columns || [];
        const tokens = (sample.line as string).split('\t');
        const labels = columns.map((c) => c.label);
        for (const idName of ids) {
          const i = labels.indexOf(idName);
          if (i !== -1) tokens[i] = '';
        }
        setCreateRawLine(tokens.join('\t'));
        setCreateRawColumns(columns);
      } catch {
        setCreateRawLine(data.rawLine ?? '');
        setCreateRawColumns(data.rawColumns || []);
      }
    } catch {
      setCreateError('Не удалось загрузить форму создания');
    } finally {
      setLoadingCreate(false);
    }
  }

  // «Дублировать» — открывает ту же форму "создать новую запись", но предзаполненную значениями
  // ТЕКУЩЕЙ открытой записи, а не пустым шаблоном (в отличие от openCreate).
  //
  // ВАЖНО: раньше бралось rawLine/rawColumns, переданные родителем (PatchesDdfEditor) — но эти
  // поля заполняются ТОЛЬКО когда запись открыта в текстовом (raw) режиме просмотра. Если
  // пользователь дублирует запись из ОБЫЧНОГО режима формы (как на скриншоте actionname-e.dat —
  // это режим по умолчанию для схем с текстовыми полями) — rawLine/rawColumns оставались пустыми
  // с самого предыдущего открытия/были null, и форма "Дублировать" открывалась совершенно
  // пустой, без единого значения исходной записи. Теперь запрашиваем raw-представление записи
  // заново по её текущему индексу (selectedIndex) — работает одинаково независимо от того, в
  // каком режиме (форма или текст) была открыта запись перед нажатием "Дублировать".
  //
  // Id-поля (см. idFields/_ID_FIELDS в ddf_registry*.py) намеренно ОЧИЩАЮТСЯ (не копируются) —
  // иначе форма стартовала бы уже с гарантированным конфликтом дубликата, который backend всё
  // равно заблокирует при сохранении (см. ddf_create/_ddf_check_duplicate_key в index.py) —
  // пользователю проще сразу увидеть пустое поле id и вписать новое значение, чем сначала
  // получить ошибку "уже существует" и только потом сообразить, что нужно поменять именно id.
  async function openDuplicate() {
    if (selectedIndex === null) return;
    setMode('create');
    setLoadingCreate(true);
    setCreateError('');
    setCreateIdFields(idFields);
    try {
      const sample = await postJson({ action: 'ddf_get_raw', server, path, index: selectedIndex });
      const columns: RawColumn[] = sample.columns || [];
      const tokens = (sample.line as string).split('\t');
      const labels = columns.map((c) => c.label);
      for (const idName of idFields) {
        const i = labels.indexOf(idName);
        if (i !== -1) tokens[i] = '';
      }
      setCreateRawLine(tokens.join('\t'));
      setCreateRawColumns(columns);
    } catch {
      setCreateError('Не удалось загрузить данные для дублирования');
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleCreateSubmit() {
    setCreating(true);
    setCreateError('');
    try {
      await postJson({ action: 'ddf_create', server, path, rawLines: [createRawLine] });
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