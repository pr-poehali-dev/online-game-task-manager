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
  show_in_team: boolean;
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

export interface ActivityEntry {
  id: number;
  userId: number | null;
  userName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityTitle: string | null;
  details: string | null;
  createdAt: string | null;
}

export interface ActivityMeta {
  label: string;
  icon: string;
  color: string;
}

export const ACTIVITY_META: Record<string, ActivityMeta> = {
  login: { label: 'Вход в систему', icon: 'LogIn', color: '152 55% 50%' },
  logout: { label: 'Выход', icon: 'LogOut', color: '215 15% 55%' },
  task_create: { label: 'Создал задачу', icon: 'Plus', color: '210 80% 62%' },
  task_update: { label: 'Изменил задачу', icon: 'Pencil', color: '210 80% 62%' },
  task_deploy_status: { label: 'Сменил статус деплоя', icon: 'Rocket', color: '45 90% 55%' },
  task_archive: { label: 'Отправил задачу в архив', icon: 'Archive', color: '0 65% 60%' },
  task_unarchive: { label: 'Вернул задачу из архива', icon: 'ArchiveRestore', color: '152 55% 50%' },
  task_delete: { label: 'Удалил задачу', icon: 'Trash2', color: '0 65% 60%' },
  kb_create: { label: 'Создал статью', icon: 'BookOpen', color: '270 65% 65%' },
  kb_update: { label: 'Изменил статью', icon: 'Pencil', color: '270 65% 65%' },
  kb_delete: { label: 'Удалил статью', icon: 'Trash2', color: '0 65% 60%' },
  idea_create: { label: 'Создал идею', icon: 'Lightbulb', color: '330 70% 62%' },
  idea_update: { label: 'Изменил идею', icon: 'Pencil', color: '330 70% 62%' },
  idea_status: { label: 'Сменил статус идеи', icon: 'Flag', color: '330 70% 62%' },
  idea_delete: { label: 'Удалил идею', icon: 'Trash2', color: '0 65% 60%' },
  sprint_create: { label: 'Создал спринт', icon: 'Zap', color: '45 90% 55%' },
  sprint_update: { label: 'Изменил спринт', icon: 'Pencil', color: '45 90% 55%' },
  sprint_delete: { label: 'Удалил спринт', icon: 'Trash2', color: '0 65% 60%' },
  user_invite: { label: 'Пригласил участника', icon: 'UserPlus', color: '152 55% 50%' },
  user_set_role: { label: 'Изменил роль участника', icon: 'Shield', color: '35 85% 58%' },
  user_set_active: { label: 'Изменил доступ участника', icon: 'UserCheck', color: '35 85% 58%' },
  user_permissions: { label: 'Изменил права участника', icon: 'KeySquare', color: '35 85% 58%' },
  user_remove: { label: 'Скрыл участника из команды', icon: 'UserX', color: '0 65% 60%' },
};

export function activityMeta(action: string): ActivityMeta {
  return ACTIVITY_META[action] ?? { label: action, icon: 'Circle', color: '215 15% 55%' };
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