import { useState } from 'react';
import { postJson } from './patchesApi';
import type { RawColumn } from './patchesDdfShared';
import type { ServerId } from './shared';

export interface RangeRow {
  index: number;
  columns: RawColumn[];
}

export function useDdfRange(server: ServerId, path: string) {
  const [idFrom, setIdFrom] = useState('');
  const [idTo, setIdTo] = useState('');
  const [rangeRows, setRangeRows] = useState<RangeRow[]>([]);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [rangeLoaded, setRangeLoaded] = useState(false);
  const [savingRows, setSavingRows] = useState<Record<number, boolean>>({});
  const [savedRows, setSavedRows] = useState<Record<number, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  // dirtyRows — строки с несохранёнными правками (изменена хотя бы одна ячейка после
  // загрузки/последнего сохранения) — используется, чтобы ОДНА общая кнопка "Сохранить" (см.
  // PatchesDdfRangePanel.tsx) была активна только когда есть что сохранять, и чтобы знать, какие
  // строки нужно отправить на сервер по её нажатию (см. saveAllDirty).
  const [dirtyRows, setDirtyRows] = useState<Record<number, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllError, setSaveAllError] = useState('');

  async function loadRange() {
    const from = parseInt(idFrom, 10);
    const to = parseInt(idTo, 10);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      setRangeError('Укажите оба значения диапазона (числа)');
      return;
    }
    setLoadingRange(true);
    setRangeError('');
    try {
      const data = await postJson({ action: 'ddf_range', server, path, idFrom: from, idTo: to });
      setRangeRows(data.rows || []);
      setRangeTruncated(!!data.truncated);
      setRangeLoaded(true);
      setSavedRows({});
      setRowErrors({});
      setDirtyRows({});
      setSaveAllError('');
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setRangeError(code === 'no_id_field' ? 'У этого файла нет понятия "ID" — диапазон недоступен' : 'Не удалось загрузить диапазон записей');
      setRangeRows([]);
      setRangeLoaded(false);
    } finally {
      setLoadingRange(false);
    }
  }

  function resetRange() {
    setIdFrom('');
    setIdTo('');
    setRangeRows([]);
    setRangeTruncated(false);
    setRangeError('');
    setRangeLoaded(false);
    setSavingRows({});
    setSavedRows({});
    setRowErrors({});
    setDirtyRows({});
    setSavingAll(false);
    setSaveAllError('');
  }

  // Редактирование прямо в ячейке таблицы диапазона (без перехода на отдельный экран
  // просмотра/редактирования записи) — пользователь правит значение колонки, но сохранение на
  // сервер происходит ТОЛЬКО по явному нажатию ОДНОЙ общей кнопки "Сохранить" под таблицей (см.
  // saveAllDirty), не автоматически по потере фокуса — правка лишь помечает строку как
  // "несохранённую" (dirtyRows), чтобы кнопка "Сохранить" стала активной.
  function updateCell(recordIndex: number, colIndex: number, value: string) {
    setRangeRows((prev) => prev.map((r) => (
      r.index === recordIndex
        ? { ...r, columns: r.columns.map((c, i) => (i === colIndex ? { ...c, value } : c)) }
        : r
    )));
    setSavedRows((prev) => ({ ...prev, [recordIndex]: false }));
    setDirtyRows((prev) => ({ ...prev, [recordIndex]: true }));
  }

  // Сохраняет ОДНУ строку — вспомогательная функция, вызывается только из saveAllDirty (по общей
  // кнопке "Сохранить" под таблицей), не из UI напрямую. Возвращает 'moved', если id-поле(я)
  // изменились и запись физически переместилась в файле (индексы остальных записей диапазона
  // тоже могли сдвинуться, см. update_record_sorted в backend) — в этом случае вызывающая сторона
  // должна перезапросить весь диапазон целиком, а не полагаться на текущие индексы.
  async function saveOneRow(recordIndex: number): Promise<'ok' | 'moved' | 'error'> {
    const rowData = rangeRows.find((r) => r.index === recordIndex);
    if (!rowData) return 'ok';
    setSavingRows((prev) => ({ ...prev, [recordIndex]: true }));
    setRowErrors((prev) => ({ ...prev, [recordIndex]: '' }));
    try {
      const line = rowData.columns.map((c) => c.value).join('\t');
      const data = await postJson({ action: 'ddf_save_raw', server, path, index: recordIndex, line });
      if (data.moved) return 'moved';
      setSavedRows((prev) => ({ ...prev, [recordIndex]: true }));
      setDirtyRows((prev) => ({ ...prev, [recordIndex]: false }));
      return 'ok';
    } catch {
      setRowErrors((prev) => ({ ...prev, [recordIndex]: 'Не удалось сохранить строку' }));
      return 'error';
    } finally {
      setSavingRows((prev) => ({ ...prev, [recordIndex]: false }));
    }
  }

  // Единая кнопка "Сохранить" под таблицей — сохраняет ВСЕ строки с несохранёнными правками
  // (dirtyRows) последовательно за один клик. Если хотя бы одна строка переместилась в файле
  // (сработало 'moved') — весь диапазон перезапрашивается заново ОДИН раз в конце (а не после
  // каждой перемещённой строки), чтобы не путаться в сдвигающихся индексах остальных ещё не
  // сохранённых строк из этого же батча.
  async function saveAllDirty() {
    const indices = rangeRows.map((r) => r.index).filter((i) => dirtyRows[i]);
    if (indices.length === 0) return;
    setSavingAll(true);
    setSaveAllError('');
    let anyMoved = false;
    let anyError = false;
    for (const idx of indices) {
      const result = await saveOneRow(idx);
      if (result === 'moved') anyMoved = true;
      if (result === 'error') anyError = true;
    }
    if (anyMoved) {
      await loadRange();
    }
    if (anyError) {
      setSaveAllError('Не удалось сохранить некоторые строки — проверьте отметки ошибок в таблице');
    }
    setSavingAll(false);
  }

  return {
    idFrom,
    setIdFrom,
    idTo,
    setIdTo,
    rangeRows,
    rangeTruncated,
    loadingRange,
    rangeError,
    rangeLoaded,
    savingRows,
    savedRows,
    rowErrors,
    dirtyRows,
    savingAll,
    saveAllError,
    loadRange,
    resetRange,
    updateCell,
    saveAllDirty,
  };
}