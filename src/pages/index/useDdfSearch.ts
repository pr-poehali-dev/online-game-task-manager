import { useState, useEffect, useCallback, useRef } from 'react';
import { postJson } from './patchesApi';
import type { SearchResult, Mode } from './patchesDdfShared';
import type { ServerId } from './shared';

export function useDdfSearch(server: ServerId, path: string) {
  const [mode, setMode] = useState<Mode>('search');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isRawOnlySchema, setIsRawOnlySchema] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasIdField, setHasIdField] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setSearchError('');
    try {
      const data = await postJson({ action: 'ddf_search', server, path, query: q, limit: 50, offset: 0 });
      setResults(data.results || []);
      setTotalRows(data.totalRows || 0);
      setIsRawOnlySchema(!!data.isRawOnly);
      setHasMore(!!data.hasMore);
      setHasIdField(!!data.hasIdField);
    } catch {
      setSearchError('Не удалось выполнить поиск');
    } finally {
      setSearching(false);
    }
  }, [server, path]);

  // Список результатов поиска раньше был жёстко ограничен первыми 50 записями файла (при пустом
  // запросе) — прокрутка "обрывалась" без явной причины, т.к. дальше просто не было загруженных
  // данных (см. hasMore/offset в backend action ddf_search). Теперь по нажатию "Показать ещё"
  // подгружаем следующую порцию, начиная с offset = текущее число уже показанных результатов —
  // dозагруженные результаты ДОБАВЛЯЮТСЯ к уже отображённым (не заменяют их).
  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await postJson({ action: 'ddf_search', server, path, query, limit: 50, offset: results.length });
      setResults((prev) => [...prev, ...(data.results || [])]);
      setHasMore(!!data.hasMore);
    } catch {
      setSearchError('Не удалось загрузить ещё записи');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    runSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'search') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch, mode]);

  return {
    mode,
    setMode,
    query,
    setQuery,
    results,
    setResults,
    totalRows,
    setTotalRows,
    searching,
    searchError,
    isRawOnlySchema,
    hasMore,
    loadingMore,
    hasIdField,
    runSearch,
    loadMore,
  };
}