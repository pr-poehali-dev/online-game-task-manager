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

export interface DefaultRule {
  keywords: string[];
}

export const ERROR_TEXTS: Record<string, string> = {
  bad_link: 'Не удалось разобрать ссылку. Нужен адрес вида https://kick.com/ник',
  exists: 'Этот стример уже добавлен',
  not_found: 'Канал на Kick не найден. Проверьте ссылку',
  kick_unavailable: 'Kick сейчас не ответил. Попробуйте ещё раз через минуту',
  no_keys: 'Не заданы ключи Kick. Обратитесь к администратору проекта',
  forbidden: 'Недостаточно прав для этого действия',
  unauthorized: 'Нужно войти заново',
};
