import type {
  Priority,
  ColumnId,
  ServerId,
  CategoryId,
  DeployStatus,
  TaskOutcome,
  Server,
  Category,
  Sprint,
} from './sharedTypes';

export const AVATAR_HUES = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%'];

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

export const columns: { id: ColumnId; title: string; icon: string }[] = [
  { id: 'todo', title: 'To Do', icon: 'Circle' },
  { id: 'progress', title: 'In Progress', icon: 'Timer' },
  { id: 'done', title: 'Done', icon: 'CheckCircle2' },
];

// «На удержании» — отдельная свёрнутая по умолчанию колонка слева от To Do. Не входит в основную
// сетку колонок (не привязана к статусам деплоя): задача любого статуса может быть временно
// отложена сюда, а при снятии с удержания пользователь сам выбирает, в какую колонку её вернуть.
export const holdColumn: { id: ColumnId; title: string; icon: string } = { id: 'hold', title: 'На удержании', icon: 'PauseCircle' };

export function columnMeta(id: ColumnId): { id: ColumnId; title: string; icon: string } {
  if (id === 'hold') return holdColumn;
  return columns.find((c) => c.id === id) ?? { id, title: id, icon: 'Circle' };
}



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
