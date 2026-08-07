import { useState } from 'react';
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
import type { ServerId } from './shared';

type LogType = 'cached' | 'server' | 'npc';

const LOG_TYPES: { id: LogType; label: string; hint: string }[] = [
  { id: 'cached', label: 'Cached', hint: 'Торговля, предметы и другие кэшируемые действия' },
  { id: 'server', label: 'Server', hint: 'Общие действия персонажей на сервере' },
  { id: 'npc', label: 'NPC', hint: 'Действия, связанные с нпс' },
];

const PAGE_SIZE = 50;

// Раздел "Логи" — пока заглушка интерфейса (backend/logs/index.py ещё не реализован, см.
// backend/logs/RESEARCH_NOTES.md, этапы 4-5). Экран уже собран целиком: выбор сервера и типа
// лога, таблица с фильтрами (игрок/предмет/действие) и пагинацией — как только появится backend,
// сюда нужно будет подключить реальный fetch вместо статичной заглушки ниже.
export default function Logs() {
  const { servers } = useCatalog();
  const [active, setActive] = useState<ServerId>('');
  const activeServer = servers.find((s) => s.id === active) ?? servers[0];
  const [logType, setLogType] = useState<LogType>('server');
  const [playerFilter, setPlayerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  const activeId = active || activeServer?.id || '';

  return (
    <div className="max-w-6xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="FileText" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Логи</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Игровые логи сервера — торговля, действия персонажей и нпс. Раздел в разработке: интерфейс
        уже готов, подключение к реальным логам появится на следующем этапе.
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

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-dashed border-border">
        <div className="relative">
          <Icon name="User" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={playerFilter}
            onChange={(e) => { setPlayerFilter(e.target.value); setPage(1); }}
            placeholder="Игрок или ник"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-44 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Package" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={itemFilter}
            onChange={(e) => { setItemFilter(e.target.value); setPage(1); }}
            placeholder="Предмет"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Icon name="Zap" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            placeholder="Действие"
            className="h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          disabled
          title="Появится вместе с backend раздела"
          className="ml-auto h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground flex items-center gap-2 opacity-50 cursor-not-allowed"
        >
          <Icon name="Calendar" size={14} />
          Дата
        </button>
      </div>

      {/* Таблица */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Игрок</TableHead>
              <TableHead>Предмет / Цель</TableHead>
              <TableHead>Детали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center py-16">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Icon name="Construction" size={28} className="opacity-50" />
                  <div className="text-sm">
                    Раздел в разработке — подключение к реальным логам сервера появится на
                    следующем этапе.
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Пагинация — по PAGE_SIZE строк на страницу, значение зарезервировано под реальный запрос */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Страница {page} · по {PAGE_SIZE} строк</span>
        <div className="flex items-center gap-1">
          <button
            disabled
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Icon name="ChevronLeft" size={14} />
          </button>
          <span className="text-xs text-muted-foreground px-2">1 / 1</span>
          <button
            disabled
            onClick={() => setPage((p) => p + 1)}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Icon name="ChevronRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}