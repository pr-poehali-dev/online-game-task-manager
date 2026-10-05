import Icon from '@/components/ui/icon';
import type { StreamSession, SessionSortKey } from './streamersTypes';

interface Props {
  sessions: StreamSession[];
  sort: SessionSortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SessionSortKey) => void;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function formatStart(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function shareColor(share: number): string {
  if (share >= 0.8) return 'text-green-500';
  if (share >= 0.3) return 'text-amber-500';
  return 'text-red-500';
}

interface HeadProps {
  label: string;
  k: SessionSortKey;
  sort: SessionSortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SessionSortKey) => void;
  right?: boolean;
}

function Head({ label, k, sort, dir, onSort, right }: HeadProps) {
  const isActive = sort === k;
  return (
    <th className={`px-3 py-2 font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${isActive ? 'text-foreground' : ''}`}
      >
        {label}
        <Icon
          name={isActive ? (dir === 'asc' ? 'ArrowUp' : 'ArrowDown') : 'ArrowUpDown'}
          size={12}
          className={isActive ? 'text-primary' : 'opacity-40'}
        />
      </button>
    </th>
  );
}

export default function StreamSessionsTable({ sessions, sort, dir, onSort }: Props) {
  const head = { sort, dir, onSort };
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <Head label="Стример" k="streamer" {...head} />
            <Head label="Начало" k="started" {...head} />
            <Head label="Длительность" k="duration" {...head} />
            <Head label="Пик зрителей" k="peak" {...head} right />
            <Head label="В среднем" k="avg" {...head} right />
            <Head label="С нужным словом" k="share" {...head} right />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-t border-border/60 hover:bg-secondary/20 transition-colors align-top">
              <td className="px-3 py-2.5">
                <a href={`https://kick.com/${s.channelSlug}`} target="_blank" rel="noreferrer" className="font-medium hover:text-primary transition-colors">
                  {s.displayName}
                </a>
                {s.title && <div className="text-xs text-muted-foreground max-w-[22rem] truncate" title={s.title}>{s.title}</div>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{formatStart(s.startedAt)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {formatDuration(s.durationSeconds)}
                {!s.endedAt && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-500 text-[10px] font-medium px-1.5 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    идёт
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{s.peakViewers}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(s.avgViewers)}</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                {s.matchShare == null ? (
                  <span className="text-muted-foreground">нет данных</span>
                ) : (
                  <span className={`font-medium tabular-nums ${shareColor(s.matchShare)}`} title={`${s.minutesMatched} из ${s.minutesTotal} мин`}>
                    {Math.round(s.matchShare * 100)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
