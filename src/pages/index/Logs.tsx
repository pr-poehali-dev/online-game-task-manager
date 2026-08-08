import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog } from '@/lib/catalog';
import { LOGS_URL, authHeaders } from './shared';
import type { ServerId } from './shared';
import LogsFilterBar from './LogsFilterBar';
import LogsTable from './LogsTable';
import LogsPagination from './LogsPagination';
import {
  PAGE_SIZE,
  TIME_FROM_KEY,
  TIME_TO_KEY,
  errorText,
} from './LogsTypes';
import type { LogType, Coverage, LogEvent } from './LogsTypes';

export default function Logs() {
  const { servers } = useCatalog();
  const [active, setActive] = useState<ServerId>('');
  useEffect(() => {
    if (!active && servers.length > 0) setActive(servers[0].id);
  }, [servers, active]);

  const [logType, setLogType] = useState<LogType>('cached');
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState('');

  const [playerFilter, setPlayerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [timeFrom, setTimeFrom] = useState(() => localStorage.getItem(TIME_FROM_KEY) || '');
  const [timeTo, setTimeTo] = useState(() => localStorage.getItem(TIME_TO_KEY) || '');

  useEffect(() => { localStorage.setItem(TIME_FROM_KEY, timeFrom); }, [timeFrom]);
  useEffect(() => { localStorage.setItem(TIME_TO_KEY, timeTo); }, [timeTo]);
  const [page, setPage] = useState(1);

  const [events, setEvents] = useState<LogEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatched, setTotalMatched] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const loadCoverage = useCallback(async (server: ServerId, type: LogType) => {
    if (!server) return;
    setCoverageLoading(true);
    setCoverageError('');
    setCoverage(null);
    try {
      const res = await fetch(
        `${LOGS_URL}?action=check_coverage&server=${encodeURIComponent(server)}&type=${type}`,
        { method: 'GET', headers: authHeaders() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoverageError(errorText(data.error || ''));
        return;
      }
      setCoverage(data);
    } catch {
      setCoverageError('Не удалось проверить наличие логов — проверьте соединение');
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  useEffect(() => { if (active) loadCoverage(active, logType); }, [active, logType, loadCoverage]);

  // Значения фильтров читаем через ref, а не напрямую из state в зависимостях useCallback —
  // иначе каждое нажатие клавиши в поле "Игрок"/"Предмет"/"Действие" меняло бы identity
  // loadEvents, что через useEffect ниже запускало бы новый запрос на КАЖДУЮ букву (именно это
  // и вызывало каскад параллельных запросов к SFTP и таймауты). Запрос теперь уходит только по
  // кнопке "Найти" (applyFilters) или смене страницы/сервера/типа лога.
  const filtersRef = useRef({ playerFilter, itemFilter, actionFilter, timeFrom, timeTo });
  filtersRef.current = { playerFilter, itemFilter, actionFilter, timeFrom, timeTo };

  const loadEvents = useCallback(async (server: ServerId, type: LogType, pageNum: number) => {
    if (!server) return;
    const { playerFilter, itemFilter, actionFilter, timeFrom, timeTo } = filtersRef.current;
    setEventsLoading(true);
    setEventsError('');
    try {
      const params = new URLSearchParams({
        action: 'get_log',
        server,
        type,
        page: String(pageNum),
        pageSize: String(PAGE_SIZE),
      });
      if (playerFilter.trim()) params.set('player', playerFilter.trim());
      if (itemFilter.trim()) params.set('item', itemFilter.trim());
      if (actionFilter.trim()) params.set('actionQuery', actionFilter.trim());
      if (timeFrom) params.set('timeFrom', timeFrom);
      if (timeTo) params.set('timeTo', timeTo);
      const res = await fetch(`${LOGS_URL}?${params.toString()}`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEventsError(errorText(data.error || ''));
        setEvents([]);
        setTotalPages(1);
        setTotalMatched(0);
        return;
      }
      setEvents(data.events || []);
      setTotalPages(data.totalPages || 1);
      setTotalMatched(data.totalMatched || 0);
    } catch {
      setEventsError('Не удалось загрузить логи — проверьте соединение');
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && coverage?.available) loadEvents(active, logType, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, logType, coverage, page]);

  function applyFilters() {
    setPage(1);
    if (active && coverage?.available) loadEvents(active, logType, 1);
  }

  const activeId = active || servers[0]?.id || '';

  return (
    <div className="max-w-6xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="FileText" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Логи</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Игровые логи сервера — торговля, действия персонажей и нпс. Забираются с VPS по SFTP.
      </p>

      <LogsFilterBar
        servers={servers}
        activeId={activeId}
        onSelectServer={setActive}
        logType={logType}
        onSelectLogType={setLogType}
        coverageLoading={coverageLoading}
        coverageError={coverageError}
        coverage={coverage}
        playerFilter={playerFilter}
        onPlayerFilterChange={setPlayerFilter}
        itemFilter={itemFilter}
        onItemFilterChange={setItemFilter}
        actionFilter={actionFilter}
        onActionFilterChange={setActionFilter}
        timeFrom={timeFrom}
        onTimeFromChange={setTimeFrom}
        timeTo={timeTo}
        onTimeToChange={setTimeTo}
        onApplyFilters={applyFilters}
        totalMatched={totalMatched}
      />

      <LogsTable
        events={events}
        eventsLoading={eventsLoading}
        eventsError={eventsError}
        expandedRow={expandedRow}
        onToggleExpandedRow={(i) => setExpandedRow(expandedRow === i ? null : i)}
      />

      <LogsPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
