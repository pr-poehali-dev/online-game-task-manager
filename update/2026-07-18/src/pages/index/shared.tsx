import type { ReactNode } from 'react';
import Icon from '@/components/ui/icon';
import func2url from '../../../backend/func2url.json';

export const AUTH_URL = (func2url as Record<string, string>).auth;
export const TASKS_URL = (func2url as Record<string, string>).tasks;
export const SPRINTS_URL = (func2url as Record<string, string>).sprints;
export const IDEAS_URL = (func2url as Record<string, string>).ideas;
export const NOTIFICATIONS_URL = (func2url as Record<string, string>).notifications;
export const TOKEN_KEY = 'era_auth_token';

export function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

export interface TeamMember {
  id: number;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  tg_username: string | null;
  specialization: string | null;
  pending: boolean;
  online: boolean;
}

export const AVATAR_HUES = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%'];

export function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function initials(first: string, last: string | null): string {
  const a = (first || '').trim();
  const b = (last || '').trim();
  if (a && b) return (a[0] + b[0]).toUpperCase();
  return (a.slice(0, 2) || '?').toUpperCase();
}

export interface AssigneeView {
  name: string;
  short: string;
  color: string;
  photo_url: string | null;
}

export function taskAssigneeIds(task: { assigneeId: number | null; assigneeIds?: number[] }): number[] {
  if (task.assigneeIds && task.assigneeIds.length > 0) return task.assigneeIds;
  return task.assigneeId != null ? [task.assigneeId] : [];
}

export function resolveAssignee(team: TeamMember[], id: number | null): AssigneeView {
  const m = id != null ? team.find((t) => t.id === id) : undefined;
  if (!m) {
    return { name: 'Не назначен', short: '—', color: '215 15% 50%', photo_url: null };
  }
  return {
    name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
    short: initials(m.first_name, m.last_name),
    color: hueFor(m.tg_username || m.first_name || String(m.id)),
    photo_url: m.photo_url,
  };
}

export function formatMskDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' МСК';
}

export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type DeadlineState = 'overdue' | 'soon' | 'normal';

export function deadlineState(iso: string | null | undefined): DeadlineState {
  const d = new Date(iso as string).getTime();
  const diff = d - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

export function mskLocalToIso(localValue: string): string {
  if (!localValue) return '';
  const withSeconds = localValue.length === 16 ? `${localValue}:00` : localValue;
  return `${withSeconds}+03:00`;
}

export function isoToMskLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function taskAge(iso: string | null | undefined): string {
  if (!iso) return '';
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';
  const diffMs = Date.now() - created;
  if (diffMs < 0) return '0ч';
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}д ${hours}ч`;
  return `${hours}ч`;
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ColumnId = 'todo' | 'progress' | 'done' | 'restart';
export type ServerId = 'c4x1' | 'hfx3old' | 'hfnew';
export type CategoryId = 'web' | 'launcher' | 'client' | 'social' | 'ads' | 'server-ext' | 'server-scripts' | 'logs' | 'events' | 'other';
export type DeployStatus = 'none' | 'in_progress' | 'local' | 'test' | 'ready_live' | 'tested_ok' | 'tested_rework' | 'unfeasible';
export type TaskOutcome = 'done' | 'unfeasible' | 'cancelled';
export type ViewId = 'board' | 'sprints' | 'archive' | 'knowledge' | 'restart' | 'ideas';

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

// Каждый статус деплоя жёстко привязан к колонке доски — выбор статуса переключает колонку задачи автоматически.
export const deployStatuses: { id: DeployStatus; label: string; color: string; icon: string; column: ColumnId }[] = [
  { id: 'none',          label: 'Без статуса',                     color: '215 15% 50%', icon: 'Minus',          column: 'todo' },
  { id: 'unfeasible',    label: 'Нереализуемо',                    color: '0 0% 55%',    icon: 'Ban',            column: 'todo' },
  { id: 'tested_rework', label: 'На доработку (есть замечания)',   color: '0 65% 60%',   icon: 'CircleX',        column: 'todo' },
  { id: 'in_progress',   label: 'Взято в работу',                  color: '35 85% 58%',  icon: 'Hammer',         column: 'progress' },
  { id: 'local',         label: 'Готово локально у скриптера',     color: '270 65% 65%', icon: 'Code2',          column: 'progress' },
  { id: 'test',          label: 'На тестировании (залито на тестовый)', color: '210 80% 62%', icon: 'FlaskConical', column: 'progress' },
  { id: 'tested_ok',     label: 'Протестировано — всё ок',         color: '152 55% 50%', icon: 'CircleCheck',    column: 'progress' },
  { id: 'ready_live',    label: 'Можно заливать на лайв',          color: '45 90% 55%',  icon: 'Rocket',         column: 'done' },
];

export function deployStatusMeta(id: DeployStatus) {
  return deployStatuses.find((d) => d.id === id) ?? deployStatuses[0];
}

export const outcomes: { id: TaskOutcome; label: string; color: string; icon: string }[] = [
  { id: 'done',       label: 'Реализовано',   color: '152 55% 50%', icon: 'CircleCheck' },
  { id: 'unfeasible', label: 'Нереализуемо',  color: '0 0% 55%',    icon: 'Ban' },
  { id: 'cancelled',  label: 'Отменено',      color: '0 65% 60%',   icon: 'XCircle' },
];

export function outcomeMeta(id: TaskOutcome) {
  return outcomes.find((o) => o.id === id) ?? outcomes[0];
}

export interface Server {
  id: ServerId;
  label: string;
  color: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
}

export const servers: Server[] = [
  { id: 'c4x1', label: 'С4х1', color: '270 65% 65%' },
  { id: 'hfx3old', label: 'HFx3 old', color: '35 85% 58%' },
  { id: 'hfnew', label: 'HF new', color: '152 60% 48%' },
];

export const categories: Category[] = [
  { id: 'web', label: 'Веб', icon: 'Globe', color: '210 80% 62%' },
  { id: 'launcher', label: 'Лаунчер', icon: 'MonitorDown', color: '270 65% 65%' },
  { id: 'client', label: 'Клиент', icon: 'Gamepad2', color: '35 85% 58%' },
  { id: 'social', label: 'Соцсети и форум', icon: 'MessagesSquare', color: '330 70% 62%' },
  { id: 'ads', label: 'Реклама', icon: 'Megaphone', color: '45 90% 55%' },
  { id: 'server-ext', label: 'Сервер · Экст', icon: 'Database', color: '0 65% 60%' },
  { id: 'server-scripts', label: 'Сервер · Скрипты', icon: 'Code2', color: '152 55% 50%' },
  { id: 'logs', label: 'Логи', icon: 'ScrollText', color: '25 80% 55%' },
  { id: 'events', label: 'Эвенты', icon: 'PartyPopper', color: '300 65% 62%' },
  { id: 'other', label: 'Прочее', icon: 'MoreHorizontal', color: '215 15% 55%' },
];

export function serverMeta(id: ServerId): Server {
  return servers.find((s) => s.id === id) ?? { id, label: id || 'Сервер', color: '215 15% 55%' };
}

export function categoryMeta(id: CategoryId) {
  return categories.find((c) => c.id === id) ?? categories[categories.length - 1];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface Task {
  id: string;
  title: string;
  column: ColumnId;
  assigneeId: number | null;
  assigneeIds?: number[];
  priority: Priority;
  version?: string;
  server: ServerId;
  description?: string;
  links?: { url: string; label: string }[];
  category: CategoryId;
  sprintId?: string;
  deployStatus?: DeployStatus;
  comments?: Comment[];
  commentCount?: number;
  archived?: boolean;
  outcome?: TaskOutcome | null;
  kbArticleIds?: number[];
  restartDone?: boolean;
  createdAt?: string | null;
  creatorId?: number | null;
  attachments?: Attachment[];
  deadline?: string | null;
}


export interface Sprint {
  id: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'planned' | 'done';
}

export const columns: { id: ColumnId; title: string; icon: string }[] = [
  { id: 'todo', title: 'To Do', icon: 'Circle' },
  { id: 'progress', title: 'In Progress', icon: 'Timer' },
  { id: 'done', title: 'Done', icon: 'CheckCircle2' },
];



export const initialSprints: Sprint[] = [
  {
    id: 's1',
    title: 'Спринт 1 · Старт проекта',
    goal: 'Запустить базовые системы: античит, лаунчер, лендинг',
    startDate: '2025-06-23',
    endDate: '2025-07-06',
    status: 'done',
  },
  {
    id: 's2',
    title: 'Спринт 2 · Ивент «Затмение»',
    goal: 'Подготовить ивент, обновить соцсети и сайт под патч 2.4',
    startDate: '2025-07-07',
    endDate: '2025-07-20',
    status: 'active',
  },
  {
    id: 's3',
    title: 'Спринт 3 · Гильдейские войны',
    goal: 'Релиз системы гильдейских войн и рекламная кампания',
    startDate: '2025-07-21',
    endDate: '2025-08-03',
    status: 'planned',
  },
];

export const priorityMap: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: 'Критич.', color: '0 72% 62%', bg: '0 72% 55% / 0.15' },
  high: { label: 'Высокий', color: '35 90% 60%', bg: '35 85% 58% / 0.15' },
  medium: { label: 'Средний', color: '210 80% 62%', bg: '210 80% 60% / 0.15' },
  low: { label: 'Низкий', color: '152 50% 55%', bg: '152 50% 50% / 0.15' },
};

export function PriorityBadge({ p }: { p: Priority }) {
  const meta = priorityMap[p];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md"
      style={{ background: `hsl(${meta.bg})`, color: `hsl(${meta.color})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${meta.color})` }} />
      {meta.label}
    </span>
  );
}

export function DeployBadge({ status }: { status: DeployStatus }) {
  const ds = deployStatuses.find((d) => d.id === status) ?? deployStatuses[0];
  if (status === 'none') return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
      style={{
        background: `hsl(${ds.color} / 0.12)`,
        color: `hsl(${ds.color})`,
        borderColor: `hsl(${ds.color} / 0.3)`,
      }}
    >
      <Icon name={ds.icon} size={10} />
      {ds.label}
    </span>
  );
}

export function CategoryBadge({ id }: { id: CategoryId }) {
  const c = categoryMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
      style={{ background: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}
    >
      <Icon name={c.icon} size={10} />
      {c.label}
    </span>
  );
}

export function AssigneeAvatar({ a, size = 24 }: { a: AssigneeView; size?: number }) {
  if (a.photo_url) {
    return <img src={a.photo_url} alt={a.name} title={a.name} className="rounded-md object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
      style={{ width: size, height: size, background: `hsl(${a.color} / 0.18)`, color: `hsl(${a.color})` }}
      title={a.name}
    >
      {a.short}
    </div>
  );
}

export function AssigneeStack({ ids, team, size = 24, max = 3 }: { ids: number[]; team: TeamMember[]; size?: number; max?: number }) {
  if (ids.length === 0) {
    return <AssigneeAvatar a={resolveAssignee(team, null)} size={size} />;
  }
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <div className="flex items-center shrink-0" title={ids.map((id) => resolveAssignee(team, id).name).join(', ')}>
      <div className="flex -space-x-2">
        {shown.map((id) => (
          <div key={id} className="ring-2 ring-card rounded-md">
            <AssigneeAvatar a={resolveAssignee(team, id)} size={size} />
          </div>
        ))}
      </div>
      {rest > 0 && (
        <span
          className="ml-1 rounded-md flex items-center justify-center text-[10px] font-semibold bg-secondary text-muted-foreground"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function DeadlineBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const state = deadlineState(iso);
  const colors: Record<DeadlineState, string> = {
    overdue: '0 65% 60%',
    soon: '35 90% 60%',
    normal: '215 15% 55%',
  };
  const color = colors[state];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0"
      style={{ background: `hsl(${color} / 0.12)`, color: `hsl(${color})` }}
      title={state === 'overdue' ? 'Срок истёк' : 'Дедлайн'}
    >
      <Icon name={state === 'overdue' ? 'AlarmClockOff' : 'AlarmClock'} size={11} />
      {formatDeadline(iso)}
    </span>
  );
}

export function ServerBadge({ id }: { id: ServerId }) {
  const s = serverMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
      style={{ background: `hsl(${s.color} / 0.15)`, color: `hsl(${s.color})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${s.color})` }} />
      {s.label}
    </span>
  );
}

export function ModalOverlay({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-border bg-card animate-scale-in mb-8 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';