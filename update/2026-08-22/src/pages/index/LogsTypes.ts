// Общие типы, константы и хелперы раздела "Логи" — вынесены отдельно, чтобы переиспользоваться
// между Logs.tsx и его под-компонентами (LogsFilterBar/LogsTable/LogsPagination) без дублирования.

export type LogType = 'cached' | 'server' | 'npc';

export const LOG_TYPES: { id: LogType; label: string; hint: string }[] = [
  { id: 'cached', label: 'Cached', hint: 'Торговля, предметы и другие кэшируемые действия' },
  { id: 'server', label: 'Server', hint: 'Общие действия персонажей на сервере' },
  { id: 'npc', label: 'NPC', hint: 'Действия, связанные с нпс' },
];

export const PAGE_SIZE = 50;

export interface Coverage {
  available: boolean;
  from: number | null;
  to: number | null;
  fileCount: number;
}

export interface LogEvent {
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
  itemStockAfter: string | null;
  itemStockBefore: string | null;
  skillId: string | null;
  skillName: string | null;
  skillLevel: string | null;
  noteLabel: string | null;
  noteValue: string | null;
  nums: (string | null)[];
  strs: (string | null)[];
}

export const TIME_FROM_KEY = 'logs_time_from';
export const TIME_TO_KEY = 'logs_time_to';

export function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const ERROR_MESSAGES: Record<string, string> = {
  sftp_not_configured: 'SFTP-доступ к логам не настроен — заполните хост/логин/пароль в разделе «Служебные ключи»',
  logs_dir_not_configured: 'Для этого сервера не указана директория логов — заполните её в настройках сервера',
  remote_dir_not_found: 'Папка с логами не найдена на VPS — проверьте директорию логов сервера',
  file_too_large: 'Слишком много данных за выбранный период — сократите диапазон дат',
  forbidden: 'Нет доступа к разделу «Логи»',
  bad_time_from: 'Неверный формат даты «От»',
  bad_time_to: 'Неверный формат даты «До»',
};

export function errorText(err: string): string {
  if (ERROR_MESSAGES[err]) return ERROR_MESSAGES[err];
  if (err?.startsWith('ssh_connect_error_') || err?.startsWith('ssh_error_') || err?.startsWith('sftp_error_')) {
    return `Не удалось подключиться к серверу логов (код: ${err})`;
  }
  return 'Не удалось загрузить логи — попробуйте ещё раз';
}
