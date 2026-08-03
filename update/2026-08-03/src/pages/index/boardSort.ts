import type { Task } from './shared';
import { taskAssigneeIds, deadlineState } from './shared';

export type SortMode = 'smart' | 'priority' | 'date_new' | 'date_old';

export const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: 'smart', label: 'Умная сортировка', icon: 'Sparkles' },
  { id: 'priority', label: 'По приоритету', icon: 'Flame' },
  { id: 'date_new', label: 'Сначала новые', icon: 'ArrowDown10' },
  { id: 'date_old', label: 'Сначала старые', icon: 'ArrowUp10' },
];

// Умная сортировка по умолчанию: сначала критичные и горящие задачи (высокий приоритет
// и/или дедлайн истёк или наступает в течение суток), внутри этой группы — по срочности
// дедлайна (у кого раньше срок — выше); затем остальные задачи по дате создания (старые
// выше, чтобы не терялись в бэклоге).
function isUrgent(t: Task): boolean {
  const highPriority = t.priority === 'critical' || t.priority === 'high';
  const burningDeadline = !!t.deadline && deadlineState(t.deadline) !== 'normal';
  return highPriority || burningDeadline;
}

export function sortTasks(list: Task[], mode: SortMode): Task[] {
  const arr = [...list];
  if (mode === 'smart') {
    arr.sort((a, b) => {
      const urgentDiff = Number(isUrgent(b)) - Number(isUrgent(a));
      if (urgentDiff !== 0) return urgentDiff;
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : null;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : null;
      if (aDeadline != null && bDeadline != null && aDeadline !== bDeadline) return aDeadline - bDeadline;
      if (aDeadline != null && bDeadline == null) return -1;
      if (aDeadline == null && bDeadline != null) return 1;
      const priorityDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    });
  } else if (mode === 'priority') {
    arr.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  } else if (mode === 'date_new') {
    arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  } else if (mode === 'date_old') {
    arr.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  }
  return arr;
}

export function canDragTask(t: Task, currentUserId: number | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (currentUserId == null) return false;
  const isCreator = t.creatorId != null && t.creatorId === currentUserId;
  const isAssignee = taskAssigneeIds(t).includes(currentUserId);
  return isCreator || isAssignee;
}
