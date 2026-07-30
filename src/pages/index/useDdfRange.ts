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
    loadRange,
    resetRange,
  };
}
