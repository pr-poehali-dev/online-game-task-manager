import type {
  Priority,
  ColumnId,
  TaskOutcome,
  Sprint,
} from './sharedTypes';

export const AVATAR_HUES = ['152 60% 48%', '210 80% 60%', '270 65% 65%', '330 70% 62%', '35 85% 58%', '190 70% 55%', '0 65% 60%', '45 90% 55%'];

// deployStatuses/deployStatusMeta УДАЛЕНЫ отсюда: список статусов деплоя теперь динамический и
// редактируется администратором (см. useCatalog() в src/lib/catalog.tsx, backend/catalog/index.py,
// таблица deploy_statuses, db_migrations V0095). Используйте useCatalog().deployStatuses /
// useCatalog().deployStatusMeta. Каждый статус по-прежнему привязан к колонке доски — выбор
// статуса переключает колонку задачи автоматически.

export const outcomes: { id: TaskOutcome; label: string; color: string; icon: string }[] = [
  { id: 'done',       label: 'Реализовано',   color: '152 55% 50%', icon: 'CircleCheck' },
  { id: 'unfeasible', label: 'Нереализуемо',  color: '0 0% 55%',    icon: 'Ban' },
  { id: 'cancelled',  label: 'Отменено',      color: '0 65% 60%',   icon: 'XCircle' },
];

export function outcomeMeta(id: TaskOutcome) {
  return outcomes.find((o) => o.id === id) ?? outcomes[0];
}

// servers/serverMeta и categories/categoryMeta — УДАЛЕНЫ отсюда: оба списка теперь динамические,
// приходят из БД через useCatalog() (см. src/lib/catalog.tsx, backend/catalog/index.py, таблицы
// servers/categories). Используйте useCatalog().categories / useCatalog().categoryMeta.

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