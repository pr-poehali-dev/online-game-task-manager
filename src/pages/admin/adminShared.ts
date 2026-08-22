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
  {
    title: 'Лаунчер',
    icon: 'UploadCloud',
    items: [
      { key: 'launcher_notify', label: 'Уведомление о лаунчере (в ТГ и на сайте, когда у задачи появляется бейдж «Требуется залить в лаунчер»)' },
    ],
  },
  {
    title: 'Команда',
    icon: 'Users',
    items: [
      { key: 'team_manage', label: 'Управление командой (разделы «Команда», «Журнал», «Хранилище» в кабинете — без права входить под другими участниками, менять роли и индивидуальные права)' },
    ],
  },
];

// Права, которые может выдавать/отзывать ТОЛЬКО владелец проекта (см. OWNER_USER_ID в
// backend/admin/index.py) — не любой администратор с доступом к разделу "Команда". Вынесены из
// PERMISSION_GROUPS в отдельный список, чтобы UserList.tsx мог показать их иначе (заблокированными
// для не-владельца) — backend всё равно отклонит попытку изменить эти права от чужого имени
// (403 owner_only_permission), но лучше явно показать это в интерфейсе, а не дать заполнить форму
// и получить ошибку только при сохранении.
export const OWNER_ONLY_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Приватные сообщения',
    icon: 'EyeOff',
    items: [
      { key: 'private_notes_view_others', label: 'Просмотр чужих приватных сообщений (без этого права виден только текст своих сообщений — отправленных или адресованных лично)' },
    ],
  },
  {
    title: 'Патчи',
    icon: 'FolderTree',
    items: [
      { key: 'patch_edit', label: 'Редактирование раздела «Патчи» (загрузка файлов и папок, создание/изменение/удаление записей внутри .dat-файлов — без этого права доступен только просмотр)' },
    ],
  },
  {
    title: 'Логи',
    icon: 'FileText',
    items: [
      { key: 'logs_view', label: 'Доступ к разделу «Логи» (ники, торговля и другие игровые действия всех игроков сервера) — отдельное право, не связано с доступом к «Патчам»' },
    ],
  },
  {
    title: 'AI',
    icon: 'Sparkles',
    items: [
      { key: 'ai_access', label: 'Доступ к разделу «AI» (чат с ИИ-моделями, генерация изображений и видео через платный внешний сервис) — расходы списываются с общего баланса проекта' },
    ],
  },
];

// Точечная донастройка ПОВЕРХ patch_edit (см. PRIVILEGED_PERMISSIONS в backend/admin/index.py —
// эти два права в него НЕ входят) — выдавать их может любой администратор с доступом к разделу
// "Команда", как и остальные обычные права из PERMISSION_GROUPS, но backend требует patch_edit=true
// как обязательное предусловие: если у пользователя нет доступа к редактированию раздела «Патчи»,
// оба права всегда эффективно false независимо от сохранённого значения (см. _effective_perms).
export const PATCH_SUB_PERMISSION_GROUP: PermissionGroup = {
  title: 'Патчи — доп. права',
  icon: 'FolderTree',
  items: [
    { key: 'patch_launcher_upload', label: 'Загрузка файлов в лаунчер (требует «Редактирование раздела «Патчи»»)' },
    { key: 'patch_delete_files', label: 'Удаление файлов из дерева патчей (требует «Редактирование раздела «Патчи»»)' },
  ],
};

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
  tg_notify_muted: boolean;
  show_tg_contact: boolean;
  ai_limit_rub: number;
  // Лимит на КОЛИЧЕСТВО файлов сотрудника в разделе "AI" (users.ai_file_limit) и текущий расход —
  // в отличие от лимита трат не сбрасывается ежемесячно, это ограничение занимаемого места.
  ai_file_limit: number;
  ai_files_used: number;
  // Второй лимит — на суммарный объём файлов сотрудника, МБ (users.ai_size_limit_mb).
  ai_size_limit_mb: number;
  ai_size_used_mb: number;
}

// Сводка трат сотрудника на раздел "AI" за текущий месяц (action=ai_usage_summary в
// backend/admin/index.py) — см. AI_MANAGER_PLAN.md, Этап 5.
export interface AiUsageSummaryItem {
  userId: number;
  name: string;
  spentRub: number;
  limitRub: number;
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

export interface DiskUsage {
  total: number;
  used: number;
  free: number;
  path: string;
}

export interface FilesBySection {
  knowledge: AdminAttachment[];
  ideas: AdminAttachment[];
  tasksActive: AdminAttachment[];
  tasksArchived: AdminAttachment[];
  diskUsage: DiskUsage | null;
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
  user_set_ai_limit: { label: 'Изменил лимит трат на AI', icon: 'Sparkles', color: '35 85% 58%' },
  user_set_ai_file_limit: { label: 'Изменил лимит файлов в AI', icon: 'FolderCog', color: '35 85% 58%' },
  user_set_ai_size_limit: { label: 'Изменил лимит объёма файлов в AI', icon: 'HardDrive', color: '35 85% 58%' },
  user_remove: { label: 'Скрыл участника из команды', icon: 'UserX', color: '0 65% 60%' },
  user_set_name: { label: 'Изменил имя участника', icon: 'Pencil', color: '35 85% 58%' },
  user_set_tg_muted: { label: 'Изменил переписку в Telegram', icon: 'BellOff', color: '35 85% 58%' },
  user_set_show_tg_contact: { label: 'Изменил кнопку Telegram в команде', icon: 'Send', color: '35 85% 58%' },
  patch_file_upload: { label: 'Загрузил файл патча', icon: 'Upload', color: '210 80% 62%' },
  patch_file_delete: { label: 'Удалил файл патча', icon: 'Trash2', color: '0 65% 60%' },
  patch_files_delete_bulk: { label: 'Удалил несколько файлов патчей', icon: 'Trash2', color: '0 65% 60%' },
  patch_server_clear: { label: 'Очистил дерево патчей сервера', icon: 'Trash2', color: '0 65% 60%' },
  patch_ddf_edit: { label: 'Отредактировал запись в .dat-файле', icon: 'Pencil', color: '270 65% 65%' },
  patch_ddf_create: { label: 'Добавил записи в .dat-файл', icon: 'Plus', color: '270 65% 65%' },
  patch_ddf_delete: { label: 'Удалил запись из .dat-файла', icon: 'Trash2', color: '0 65% 60%' },
  patch_launcher_upload: { label: 'Залил файл в лаунчер', icon: 'Rocket', color: '45 90% 55%' },
  patch_folder_add: { label: 'Создал папку патчей', icon: 'FolderPlus', color: '152 55% 50%' },
  patch_folder_delete: { label: 'Удалил папку патчей', icon: 'FolderMinus', color: '0 65% 60%' },
  patch_folder_rename: { label: 'Переименовал папку патчей', icon: 'Pencil', color: '35 85% 58%' },
  patch_file_attach_task: { label: 'Прикрепил файл к задаче', icon: 'Link', color: '210 80% 62%' },
  patch_file_detach_task: { label: 'Открепил файл от задачи', icon: 'Unlink', color: '215 15% 55%' },
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