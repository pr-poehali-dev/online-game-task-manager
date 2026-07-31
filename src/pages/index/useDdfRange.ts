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
  // загрузки/последнего сохранения) — используется, чтобы кнопка "Сохранить" в конце ряда была
  // активна только когда есть что сохранять (см. PatchesDdfRangePanel.tsx).
  const [dirtyRows, setDirtyRows] = useState<Record<number, boolean>>({});

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
  }

  // Редактирование прямо в ячейке таблицы диапазона (без перехода на отдельный экран
  // просмотра/редактирования записи) — пользователь правит значение колонки, но сохранение на
  // сервер происходит ТОЛЬКО по явному нажатию кнопки "Сохранить" в конце ряда (см. saveRow),
  // не автоматически по потере фокуса — правка лишь помечает строку как "несохранённую"
  // (dirtyRows), чтобы кнопка "Сохранить" стала активной.
  function updateCell(recordIndex: number, colIndex: number, value: string) {
    setRangeRows((prev) => prev.map((r) => (
      r.index === recordIndex
        ? { ...r, columns: r.columns.map((c, i) => (i === colIndex ? { ...c, value } : c)) }
        : r
    )));
    setSavedRows((prev) => ({ ...prev, [recordIndex]: false }));
    setDirtyRows((prev) => ({ ...prev, [recordIndex]: true }));
  }

  async function saveRow(recordIndex: number) {
    const rowData = rangeRows.find((r) => r.index === recordIndex);
    if (!rowData) return;
    setSavingRows((prev) => ({ ...prev, [recordIndex]: true }));
    setRowErrors((prev) => ({ ...prev, [recordIndex]: '' }));
    try {
      const line = rowData.columns.map((c) => c.value).join('\t');
      const data = await postJson({ action: 'ddf_save_raw', server, path, index: recordIndex, line });
      if (data.moved) {
        // Изменение id-поля(ей) физически переместило запись в файле — индексы других записей
        // диапазона тоже могли сдвинуться (см. update_record_sorted в backend), поэтому проще и
        // надёжнее перезапросить диапазон целиком, чем пытаться пересчитать сдвиги на фронтенде.
        await loadRange();
      } else {
        setSavedRows((prev) => ({ ...prev, [recordIndex]: true }));
        setDirtyRows((prev) => ({ ...prev, [recordIndex]: false }));
      }
    } catch {
      setRowErrors((prev) => ({ ...prev, [recordIndex]: 'Не удалось сохранить строку' }));
    } finally {
      setSavingRows((prev) => ({ ...prev, [recordIndex]: false }));
    }
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
    loadRange,
    resetRange,
    updateCell,
    saveRow,
  };
}