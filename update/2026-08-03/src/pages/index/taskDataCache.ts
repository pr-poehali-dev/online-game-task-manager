import type { TaskComment } from './TaskModalShared';
import type { PrivateNote } from './usePrivateNotes';

// Кеш комментариев/приватных заметок по задачам на время сессии (тот же принцип, что и паттерн
// visited в IndexMain.tsx/Cabinet.tsx) — TaskModal монтируется и размонтируется при каждом
// открытии/закрытии карточки задачи, а задач может быть сотни, поэтому вместо "держать все
// смонтированными" используется лёгкий кеш в памяти: один раз загруженные данные переиспользуются
// при повторном открытии той же задачи без повторного fetch и спиннера. Кеш точечно обновляется
// при мутациях (добавление/удаление комментария или заметки), поэтому не протухает в рамках сессии.
export const commentsCache = new Map<string, TaskComment[]>();
export const privateNotesCache = new Map<string, PrivateNote[]>();
