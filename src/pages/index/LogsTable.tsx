import { Fragment } from 'react';
import Icon from '@/components/ui/icon';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { LogEvent } from './LogsTypes';

interface LogsTableProps {
  events: LogEvent[];
  eventsLoading: boolean;
  eventsError: string;
  expandedRow: number | null;
  onToggleExpandedRow: (index: number) => void;
}

export default function LogsTable({
  events,
  eventsLoading,
  eventsError,
  expandedRow,
  onToggleExpandedRow,
}: LogsTableProps) {
  return (
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
            <TableHead>Заметка</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {eventsLoading ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-16">
                <Icon name="Loader2" size={22} className="animate-spin text-primary mx-auto" />
              </TableCell>
            </TableRow>
          ) : eventsError ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-16">
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <Icon name="AlertCircle" size={24} />
                  <div className="text-sm">{eventsError}</div>
                </div>
              </TableCell>
            </TableRow>
          ) : events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-16">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Icon name="Inbox" size={24} className="opacity-50" />
                  <div className="text-sm">Событий не найдено</div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            events.map((e, i) => (
              <Fragment key={i}>
              <TableRow>
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
                      {e.skillLevel && ` Lv.${e.skillLevel}`}
                      {e.skillId && <span className="text-xs opacity-70"> ({e.skillId})</span>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {e.itemCount && (
                    <div>
                      <span className={Number(e.itemCount) < 0 ? 'text-destructive' : 'text-emerald-500'}>
                        {Number(e.itemCount) > 0 ? '+' : ''}{e.itemCount}
                      </span>
                      {e.itemStockAfter && (
                        <span className="text-xs text-muted-foreground">
                          {' '}({e.itemStockBefore ?? '?'} → {e.itemStockAfter})
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{e.itemDbId}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {e.locX && e.locY && e.locZ && `${e.locX}, ${e.locY}, ${e.locZ}`}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs">
                  {e.noteValue && (
                    <div>
                      <span className="text-xs opacity-70">{e.noteLabel}: </span>
                      {e.noteValue}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onToggleExpandedRow(i)}
                    title="Показать все поля (Num1-10, Str1-3)"
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <Icon name={expandedRow === i ? 'ChevronUp' : 'ChevronDown'} size={14} />
                  </button>
                </TableCell>
              </TableRow>
              {expandedRow === i && (
                <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                  <TableCell colSpan={10} className="py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1.5 text-xs">
                      {e.nums.map((v, idx) => (
                        <div key={idx} className="flex gap-1.5">
                          <span className="text-muted-foreground shrink-0">Num{idx + 1}:</span>
                          <span className="font-mono">{v ?? '—'}</span>
                        </div>
                      ))}
                      {e.strs.map((v, idx) => (
                        <div key={idx} className="flex gap-1.5">
                          <span className="text-muted-foreground shrink-0">Str{idx + 1}:</span>
                          <span className="font-mono break-all">{v ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
