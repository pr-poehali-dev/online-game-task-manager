import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog } from '@/lib/catalog';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { LOGS_URL, authHeaders } from './shared';
import type { ServerId } from './shared';

type LogType = 'cached' | 'server' | 'npc';

const LOG_TYPES: { id: LogType; label: string; hint: string }[] = [
  { id: 'cached', label: 'Cached', hint: 'Торговля, предметы и другие кэшируемые действия' },
  { id: 'server', label: 'Server', hint: 'Общие действия персонажей на сервере' },
  { id: 'npc', label: 'NPC', hint: 'Действия, связанные с нпс' },
];

const PAGE_SIZE = 50;

interface LogFile {
  name: string;
  date: string;
  size: number;
  modifiedAt: number;
  instance: string;
}

interface LogEvent {
  time: string;
  actionId: string | null;
  actionName: string | null;
  actor: string | null;
  actorLogin: string | null;
  actorId: string | null;
  actorAccId: string | null;
  target: string | null;
  targetLogin: string | null;
  targetId: string | null;
  targetAccId: string | null;
  locX: string | null;
  locY: string | null;
  locZ: string | null;
  itemId: string | null;
  itemName: string | null;
  itemCount: string | null;
  itemDbId: string | null;
  itemEnchant: string | null;
  skillId: string | null;
  skillName: string | null;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const ERROR_MESSAGES: Record<string, string> = {
  sftp_not_configured: 'SFTP-доступ к логам не настроен — заполните хост/логин/пароль в разделе «Служебные ключи»',
  logs_dir_not_configured: 'Для этого сервера не указана директория логов — заполните её в настройках сервера',
  remote_dir_not_found: 'Папка с логами не найдена на VPS — проверьте директорию логов сервера',
  remote_file_not_found: 'Файл лога не найден на VPS',
  file_too_large: 'Файл лога слишком большой',
  forbidden: 'Нет доступа к разделу «Логи»',
  bad_time_from: 'Неверный формат даты «От»',
  bad_time_to: 'Неверный формат даты «До»',
};

function errorText(err: string): string {
  if (ERROR_MESSAGES[err]) return ERROR_MESSAGES[err];
  if (err?.startsWith('ssh_connect_error_') || err?.startsWith('ssh_error_') || err?.startsWith('sftp_error_')) {
    return `Не удалось подключиться к серверу логов (код: ${err})`;
  }
  return 'Не удалось загрузить логи — попробуйте ещё раз';
}

export default function Logs() {
  const { servers } = useCatalog();
  const [active, setActive] = useState<ServerId>('');
  useEffect(() => {
    if (!active && servers.length > 0) setActive(servers[0].id);
  }, [servers, active]);

  const [logType, setLogType] = useState<LogType>('server');
  const [files, setFiles] = useState<LogFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [activeFile, setActiveFile] = useState('');

  const [playerFilter, setPlayerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [page, setPage] = useState(1);

  const [events, setEvents] = useState<LogEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatched, setTotalMatched] = useState(0);

  const loadFiles = useCallback(async (server: ServerId, type: LogType) => {
    if (!server) return;
    setFilesLoading(true);
    setFilesError('');
    setFiles([]);
    setActiveFile('');
    try {
      const res = await fetch(
        `${LOGS_URL}?action=list_files&server=${encodeURIComponent(server)}&type=${type}`,
        { method: 'GET', headers: authHeaders() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFilesError(errorText(data.error || ''));
        return;
      }
      const list: LogFile[] = data.files || [];
      setFiles(list);
      if (list.length > 0) setActiveFile(list[0].name);
    } catch {
      setFilesError('Не удалось получить список файлов — проверьте соединение');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => { if (active) loadFiles(active, logType); }, [active, logType, loadFiles]);

  const loadEvents = useCallback(async (server: ServerId, type: LogType, file: string, pageNum: number) => {
    if (!server || !file) return;
    setEventsLoading(true);
    setEventsError('');
    try {
      const params = new URLSearchParams({
        action: 'get_log',
        server,
        type,
        file,
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
  }, [playerFilter, itemFilter, actionFilter, timeFrom, timeTo]);

  useEffect(() => {
    if (active && activeFile) loadEvents(active, logType, activeFile, page);
  }, [active, logType, activeFile, page, loadEvents]);

  function applyFilters() {
    setPage(1);
    if (active && activeFile) loadEvents(active, logType, activeFile, 1);
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

      {/* Выбор сервера */}
      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-4 w-fit flex-wrap">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeId === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: activeId === s.id ? 'currentColor' : `hsl(${s.color})` }} />
            {s.label}
          </button>
        ))}
        {servers.length === 0 && (
          <span className="text-xs text-muted-foreground px-2 py-1.5">Серверов пока нет</span>
        )}
      </div>

      {/* Выбор типа лога */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {LOG_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setLogType(t.id)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              logType === t.id ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-secondary/40'
            }`}
          >
            <div className={`text-sm font-medium ${logType === t.id ? 'text-primary' : 'text-foreground'}`}>{t.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.hint}</div>
          </button>
        ))}
      </div>

      {/* Выбор файла */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Icon name="File" size={13} className="text-muted-foreground shrink-0" />
        {filesLoading ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Icon name="Loader2" size={12} className="animate-spin" />
            Загрузка списка файлов…
          </span>
        ) : filesError ? (
          <span className="text-xs text-destructive flex items-center gap-1.5">
            <Icon name="AlertCircle" size={12} />
            {filesError}
          </span>
        ) : files.length === 0 ? (
          <span className="text-xs text-muted-foreground">Файлов лога пока нет</span>
        ) : (
          <select
            value={activeFile}
            onChange={(e) => { setActiveFile(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-border bg-background text-sm max-w-full"
          >
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} · {fmtSize(f.size)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
        <div className="relative">
          <Icon name="User" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            placeholder="Игрок или ник"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-44 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Package" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            placeholder="Предмет"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Zap" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            placeholder="Действие"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="Calendar" size={13} className="text-muted-foreground shrink-0" />
          <input
            type="datetime-local"
            step="1"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="h-9 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="datetime-local"
            step="1"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="h-9 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={applyFilters}
          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Icon name="Search" size={14} />
          Найти
        </button>
        {totalMatched > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">Найдено: {totalMatched}</span>
        )}
      </div>

      {/* Таблица */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Игрок</TableHead>
              <TableHead>Цель</TableHead>
              <TableHead>Предмет</TableHead>
              <TableHead>Кол-во</TableHead>
              <TableHead>DB item id</TableHead>
              <TableHead>Координаты</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <Icon name="Loader2" size={22} className="animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : eventsError ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <Icon name="AlertCircle" size={24} />
                    <div className="text-sm">{eventsError}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Icon name="Inbox" size={24} className="opacity-50" />
                    <div className="text-sm">Событий не найдено</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              events.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{e.time}</TableCell>
                  <TableCell className="text-sm">
                    {e.actionName || <span className="text-muted-foreground">#{e.actionId}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.actor && (
                      <div>
                        {e.actor}
                        {e.actorId && <span className="text-xs opacity-70"> ({e.actorId})</span>}
                      </div>
                    )}
                    {e.actorLogin && (
                      <div className="text-xs text-muted-foreground">
                        {e.actorLogin}
                        {e.actorAccId && <span className="opacity-70"> ({e.actorAccId})</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.target && (
                      <div>
                        {e.target}
                        {e.targetId && <span className="text-xs opacity-70"> ({e.targetId})</span>}
                      </div>
                    )}
                    {e.targetLogin && (
                      <div className="text-xs text-muted-foreground">
                        {e.targetLogin}
                        {e.targetAccId && <span className="opacity-70"> ({e.targetAccId})</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(e.itemName || e.itemId) && (
                      <div>
                        {e.itemEnchant && <span className="text-primary">+{e.itemEnchant} </span>}
                        {e.itemName ? (
                          <>
                            {e.itemName}
                            <span className="text-xs opacity-70"> ({e.itemId})</span>
                          </>
                        ) : (
                          `#${e.itemId}`
                        )}
                      </div>
                    )}
                    {e.skillName && (
                      <div>
                        {e.skillName}
                        {e.skillId && <span className="text-xs opacity-70"> ({e.skillId})</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.itemCount && (
                      <span className={Number(e.itemCount) < 0 ? 'text-destructive' : 'text-emerald-500'}>
                        {Number(e.itemCount) > 0 ? '+' : ''}{e.itemCount}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.itemDbId}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {e.locX && e.locY && e.locZ && `${e.locX}, ${e.locY}, ${e.locZ}`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Пагинация */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Страница {page} из {totalPages} · по {PAGE_SIZE} строк</span>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="ChevronLeft" size={14} />
          </button>
          <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="ChevronRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}