import func2url from '../../../backend/func2url.json';
import { AVATAR_HUES } from './sharedConstants';
import type { TeamMember, AssigneeView, DeadlineState, ColumnId, DeployStatus } from './sharedTypes';

export const AUTH_URL = (func2url as Record<string, string>).auth;
export const TASKS_URL = (func2url as Record<string, string>).tasks;
export const SPRINTS_URL = (func2url as Record<string, string>).sprints;
export const IDEAS_URL = (func2url as Record<string, string>).ideas;
export const NOTIFICATIONS_URL = (func2url as Record<string, string>).notifications;
export const PATCHNOTES_URL = (func2url as Record<string, string>).patchnotes;
export const PATCHES_URL = (func2url as Record<string, string>).patches;
export const LOGS_URL = (func2url as Record<string, string>).logs;
export const AI_URL = (func2url as Record<string, string>).ai;
// AI_STREAM_URL — потоковый (SSE) ответ обычного чата, работает ТОЛЬКО на self-hosted-сервере
// (см. deploy/server.py, /api/ai/stream) — облачные функции poehali.dev его не поддерживают.
// Строится из AI_URL заменой последнего сегмента пути на 'stream': на self-hosted AI_URL это
// относительный путь вида '/api/ai', в облаке — полный адрес облачной функции без сегмента
// 'stream' в пути, поэтому там запрос к нему всегда получит 404 — фронт (см. useAiSection.ts,
// sendMessageStream) сам обнаруживает это и молча переходит на обычный запрос.
export const AI_STREAM_URL = AI_URL ? `${AI_URL.replace(/\/$/, '')}/stream` : '';
export const TOKEN_KEY = 'era_auth_token';

export function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

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

export function taskAssigneeIds(task: { assigneeId: number | null; assigneeIds?: number[] }): number[] {
  if (task.assigneeIds && task.assigneeIds.length > 0) return task.assigneeIds;
  return task.assigneeId != null ? [task.assigneeId] : [];
}

// Серверы задачи: новый список servers, а для задач, созданных до его появления, — одиночный
// server. Единая точка, чтобы старые задачи везде отображались корректно.
export function taskServerIds(task: { server?: string | null; servers?: string[] }): string[] {
  if (task.servers && task.servers.length > 0) return task.servers;
  return task.server ? [task.server] : [];
}

// Спринты задачи: новый список sprintIds, а для задач, созданных до его появления, — одиночный
// sprintId. Единая точка, чтобы старые задачи везде отображались корректно.
export function taskSprintIds(task: { sprintId?: string | null; sprintIds?: string[] }): string[] {
  if (task.sprintIds && task.sprintIds.length > 0) return task.sprintIds;
  return task.sprintId ? [task.sprintId] : [];
}

// Поиск задачи по строке запроса: по номеру (точное совпадение id — так сотрудник, знающий
// только номер из ссылки/уведомления, сразу находит нужную карточку, даже если начал вводить с
// решётки "#141") и по вхождению в название — так же, как обычный текстовый поиск.
export function taskMatchesSearch(task: { id: string; title: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qNoHash = q.startsWith('#') ? q.slice(1) : q;
  if (qNoHash && task.id.toLowerCase() === qNoHash) return true;
  return task.title.toLowerCase().includes(q);
}

// Серверы спринта — та же логика совместимости, что и у задач (см. taskServerIds).
export function sprintServerIds(sprint: { server?: string | null; servers?: string[] }): string[] {
  if (sprint.servers && sprint.servers.length > 0) return sprint.servers;
  return sprint.server ? [sprint.server] : [];
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

// Задача требует заливки файлов патча в лаунчер, если у неё есть прикреплённые файлы
// и она находится в состоянии, готовом к раскатке («Можно заливать на лайв» или «На лайв»),
// но ещё не отмечена как загруженная.
export function needsLauncherUpload(task: { column: ColumnId; deployStatus?: DeployStatus; launcherUploaded?: boolean }, hasFiles: boolean): boolean {
  if (!hasFiles || task.launcherUploaded) return false;
  return task.column === 'restart' || task.deployStatus === 'ready_live';
}