import type { PermissionKey } from '@/lib/auth';
import func2url from '../../../backend/func2url.json';

// PERSISTENCE_MARKER_2024_PERM_CHECK — маркер проверки сохранения изменений
export const ADMIN_URL = (func2url as Record<string, string>).admin;
export const TOKEN_KEY = 'era_auth_token';

export type Permissions = Partial<Record<PermissionKey, boolean>>;

export interface PermissionGroup {
  title: string;
  icon: string;
  items: { key: PermissionKey; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Задачи',
    icon: 'ClipboardList',
    items: [
      { key: 'task_create', label: 'Создание задач' },
      { key: 'task_edit_own', label: 'Редактирование своих задач (созданных самим)' },
      { key: 'task_view_others', label: 'Просмотр чужих задач' },
      { key: 'task_restart', label: 'Перенос своих задач в «К рестарту»' },
    ],
  },
  {
    title: 'Идеи',
    icon: 'Lightbulb',
    items: [
      { key: 'idea_create', label: 'Создание идей' },
    ],
  },
  {
    title: 'База знаний',
    icon: 'BookOpen',
    items: [
      { key: 'kb_create', label: 'Создание статей' },
      { key: 'kb_edit', label: 'Редактирование статей' },
    ],
  },
  {
    title: 'Спринты',
    icon: 'Zap',
    items: [
      { key: 'sprint_create', label: 'Создание спринтов' },
      { key: 'sprint_edit', label: 'Редактирование спринтов' },
    ],
  },
];

export interface TeamUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  member_id: string | null;
  tg_username: string | null;
  is_active: boolean;
  created_at: string | null;
  specialization: string | null;
  online: boolean;
  active_sessions: number;
  permissions: Permissions;
}

export interface SessionInfo {
  id: number;
  created_at: string | null;
  expires_at: string | null;
  active: boolean;
}

export interface UserStats {
  createdCount: number;
  closedCount: number;
  receivedCount: number;
  timeSpentSeconds: number;
}

export interface AdminAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
  entityId: string;
  entityTitle: string;
  updatedAt: string | null;
}

export interface FilesBySection {
  knowledge: AdminAttachment[];
  ideas: AdminAttachment[];
  tasksActive: AdminAttachment[];
  tasksArchived: AdminAttachment[];
}

export function fmtFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function fmtDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return '< 1 мин';
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  return parts.join(' ');
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function authFetch(body: object) {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return fetch(ADMIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: JSON.stringify(body),
  });
}