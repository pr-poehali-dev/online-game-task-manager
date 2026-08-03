import type { TopicListItem, IdeaComment } from './shared';

// Кеш открытых тем идей (тема + её комментарии) по ID на время сессии — тот же принцип, что и
// taskDataCache.ts/articleCache.ts. Ideas остаётся смонтирован на весь сеанс (см. IndexMain.tsx,
// паттерн visited), но открытие темы внутри него переключает локальный state current/comments
// через ссылку в URL (/idea/:id), и без кеша повторное открытие той же темы (список → тема →
// список → та же тема) заново делало бы fetch и показывало спиннер. Кеш точечно обновляется при
// мутациях (комментарии, статус, редактирование), поэтому не протухает в рамках сессии.
export const ideaCache = new Map<string, { topic: TopicListItem; comments: IdeaComment[] }>();
