// Служебные константы и чистые функции раздела "AI" — вынесены из Ai.tsx, чтобы корневой
// компонент остался тонкой сборкой. Ничего из состояния React здесь нет, только справочники
// текстов ошибок и обёртка над fetch.

export const AI_MODEL_KEY_PREFIX = 'ai_last_model_';
export const VIDEO_POLL_INTERVAL = 6000;

export const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'Раздел «AI» вам не доступен — обратитесь к владельцу проекта',
  unauthorized: 'Сессия истекла — обновите страницу и войдите заново',
  aitunnel_not_configured: 'Доступ к AI Tunnel не настроен — заполните ключ в разделе «Служебные ключи»',
  aitunnel_unreachable: 'Не удалось связаться с AI Tunnel — проверьте соединение и попробуйте ещё раз',
  aitunnel_error: 'Модель вернула ошибку — попробуйте другую модель или переформулируйте запрос',
  limit_exceeded: 'Месячный лимит на AI исчерпан — обратитесь к администратору, чтобы увеличить лимит',
  file_too_large: 'Файл слишком большой (максимум 200 МБ)',
  file_limit_exceeded: 'Достигнут лимит файлов — очистите ненужные в разделе «Мои файлы» или попросите администратора увеличить лимит',
  no_data: 'Не удалось прочитать файл',
  bad_request: 'Заполните запрос перед отправкой',
  not_found: 'Диалог не найден — возможно, он был удалён',
  nothing_to_regenerate: 'Нечего перегенерировать — в диалоге пока нет ответа модели',
};

// Коды ошибок AI Tunnel совпадают с HTTP-статусами (см. docs/ai-tunnel-api-reference.md, раздел
// "Ошибки") — по статусу можно дать более точную подсказку, чем универсальное "модель вернула
// ошибку", не разбирая текст message на стороне фронта.
export const AITUNNEL_STATUS_MESSAGES: Record<number, string> = {
  400: 'Модель не приняла запрос — попробуйте другую модель или измените промпт',
  401: 'Ключ AI Tunnel недействителен — сообщите администратору, нужно обновить его в «Служебных ключах»',
  402: 'На балансе AI Tunnel закончились деньги — сообщите администратору проекта',
  429: 'Модель сейчас перегружена запросами — подождите немного и попробуйте снова',
};

export function errorText(err: string, message?: string, status?: number): string {
  if (err === 'aitunnel_error') {
    if (status && AITUNNEL_STATUS_MESSAGES[status]) return AITUNNEL_STATUS_MESSAGES[status];
    if (message) return message;
  }
  return ERROR_MESSAGES[err] || 'Не удалось выполнить запрос — попробуйте ещё раз';
}

// Ждём ответ модели дольше, чем текстовый чат: сообщения с вложенными картинками/PDF и генерация
// изображений/видео объективно занимают больше времени (см. AI_MANAGER_PLAN.md — известное
// платформенное ограничение). Без явного таймаута соединение иногда обрывается стороной сети
// раньше, чем backend успевает ответить (видно в логах как "Request cancelled"/"Failed to
// fetch") — сообщение при этом просто "зависает" без объяснения, что случилось. Явный
// AbortController даёт вместо этого понятную ошибку и гарантированно разблокирует композер.
export const SEND_TIMEOUT_MS = 120000;

export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
