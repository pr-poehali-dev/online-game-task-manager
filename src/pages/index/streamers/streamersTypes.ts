export interface StreamerLive {
  sessionId: number;
  startedAt: string;
  title: string;
  peakViewers: number;
  category: string | null;
  viewers: number;
  ruleMatched: boolean;
}

export interface Streamer {
  id: number;
  platform: string;
  channelSlug: string;
  channelUrl: string;
  displayName: string;
  avatarUrl: string | null;
  gameUserId: string | null;
  isActive: boolean;
  ownershipVerified: boolean;
  note: string | null;
  createdAt: string | null;
  live: StreamerLive | null;
}

export interface CollectorHealth {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorText: string | null;
  secondsSinceSuccess: number | null;
  healthy: boolean;
}

export type MatchMode = 'any' | 'all';

export interface Rule {
  streamerId: number | null;
  keywords: string[];
  matchMode: MatchMode;
  checkTitle: boolean;
  checkTags: boolean;
}

export type DefaultRule = Rule;

export interface StreamSession {
  id: number;
  streamerId: number;
  displayName: string;
  channelSlug: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  peakViewers: number;
  avgViewers: number;
  minutesTotal: number;
  minutesMatched: number;
  matchShare: number | null;
  title: string;
  reviewStatus: 'auto' | 'confirmed' | 'disputed';
}

export type SessionSortKey = 'streamer' | 'started' | 'duration' | 'peak' | 'avg' | 'share';

export interface SessionFilters {
  streamerId: string;
  dateFrom: string;
  dateTo: string;
}

export const ERROR_TEXTS: Record<string, string> = {
  bad_link: 'Не удалось разобрать ссылку. Нужен адрес вида https://kick.com/ник',
  exists: 'Этот стример уже добавлен',
  not_found: 'Канал на Kick не найден. Проверьте ссылку',
  kick_unavailable: 'Kick сейчас не ответил. Попробуйте ещё раз через минуту',
  no_keys: 'Не заданы ключи Kick. Обратитесь к администратору проекта',
  forbidden: 'Недостаточно прав для этого действия',
  unauthorized: 'Нужно войти заново',
  bad_date: 'Дата указана неверно',
  bad_params: 'Не удалось применить фильтры',
};
