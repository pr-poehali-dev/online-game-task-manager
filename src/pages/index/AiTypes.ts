// Общие типы раздела "AI" — вынесены отдельно, переиспользуются между Ai.tsx и его
// под-компонентами (AiChatList/AiModelPicker/AiMessageList/AiComposer). См. AI_MANAGER_PLAN.md.

export interface AiChatSummary {
  id: number;
  title: string;
  mode: 'chat' | 'image' | 'video' | 'code';
  model: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface AiMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: AiAttachment[] | null;
  model: string | null;
  costRub: number | null;
  jobStatus: 'pending' | 'done' | 'failed';
  createdAt: string | null;
  // pinned — закрепление ОДНОГО сообщения (только ответов ассистента) внутри диалога, отдельно от
  // AiChatSummary.pinned (закрепляет весь чат в списке слева) — для быстрого поиска полезного
  // ответа в длинной переписке (см. backend/ai/index.py, action=set_message_pinned).
  pinned: boolean;
}

// Одна модель из публичного каталога AI Tunnel (GET /public/aitunnel/models/{chat,images,videos})
// — ключ объекта в ответе API — имя модели для поля model в запросе (см.
// docs/ai-tunnel-api-reference.md). prompt_cost/completion_cost — для группы chat (₽ за 1М
// токенов), min_price_per_image/max_price_per_image — для images (₽ за картинку),
// min_price_per_second/max_price_per_second — для videos (₽ за секунду ролика).
export interface AiModelInfo {
  provider: string;
  prompt_cost?: number;
  completion_cost?: number;
  context_size?: number;
  max_output?: number;
  description?: string;
  modalities?: { input?: string[]; output?: string[] };
  created?: number;
  min_price_per_image?: number;
  max_price_per_image?: number;
  min_price_per_second?: number;
  max_price_per_second?: number;
}

export type AiModelsMap = Record<string, AiModelInfo>;

export interface AiUsage {
  spentRub: number;
  limitRub: number;
}

// Человекочитаемые названия провайдеров для группировки в AiModelPicker — ключ должен совпадать
// с полем provider из ответа AI Tunnel. Провайдер, которого нет в этом словаре, просто
// показывается под своим сырым именем (see AiModelPicker.tsx).
export const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  meta: 'Meta Llama',
  'meta-llama': 'Meta Llama',
  mistral: 'Mistral AI',
  mistralai: 'Mistral AI',
  xai: 'xAI',
  qwen: 'Qwen',
  alibaba: 'Qwen',
  moonshot: 'Moonshot AI',
  moonshotai: 'Moonshot AI',
  zhipu: 'Z AI',
  'z-ai': 'Z AI',
  minimax: 'MiniMax',
  perplexity: 'Perplexity',
  xiaomi: 'Xiaomi',
  bytedance: 'ByteDance Seed',
  aion: 'Aion Labs',
  'aion-labs': 'Aion Labs',
  sber: 'Sber',
  aitunnel: 'AI Tunnel',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider?.toLowerCase()] || provider || 'Другое';
}

// Единая "сравнимая цена" модели независимо от группы (chat/images/videos) — нужна, чтобы
// отсортировать разнородные модели по стоимости и разбить на категории "Дешёвые"/"Продвинутые"
// в AiModelPicker. Для чата — сумма prompt+completion (₽ за 1М токенов), для картинок и видео —
// верхняя граница диапазона (max_price_per_image/max_price_per_second), т.к. в чате комиссия
// платится один раз за токен, а не диапазоном.
export function modelComparableCost(info: AiModelInfo): number | null {
  if (info.prompt_cost != null && info.completion_cost != null) {
    return info.prompt_cost + info.completion_cost;
  }
  if (info.max_price_per_image != null) return info.max_price_per_image;
  if (info.max_price_per_second != null) return info.max_price_per_second;
  return null;
}

// Модель считается "устаревшей" (показываем плашку и опускаем в конец списка), если внутри того
// же семейства (тот же provider + тот же "буквенный костяк" id без версий-чисел) уже есть модель
// НОВЕЕ (по полю created) и НЕ ДОРОЖЕ (с запасом 20%, чтобы не считать легаси случаи, где новая
// версия выросла в цене) — то есть появилась прямая более свежая замена по той же цене или
// дешевле. Опирается только на данные из публичного каталога AI Tunnel, ничего не хардкодим по
// конкретным id моделей — список актуален сам по себе при обновлении каталога.
function modelFamilyKey(modelId: string): string {
  const parts = modelId.split('-').filter((p) => !/^\d+(\.\d+)*$/.test(p));
  return parts.join('-');
}

export function findSupersedingModel(modelId: string, info: AiModelInfo, allModels: AiModelsMap): string | null {
  const cost = modelComparableCost(info);
  const created = info.created || 0;
  if (cost == null) return null;
  const family = modelFamilyKey(modelId);
  let best: { id: string; created: number } | null = null;
  for (const [otherId, otherInfo] of Object.entries(allModels)) {
    if (otherId === modelId || otherInfo.provider !== info.provider) continue;
    if (modelFamilyKey(otherId) !== family) continue;
    const otherCost = modelComparableCost(otherInfo);
    const otherCreated = otherInfo.created || 0;
    if (otherCost == null) continue;
    if (otherCreated > created && otherCost <= cost * 1.2) {
      if (!best || otherCreated > best.created) best = { id: otherId, created: otherCreated };
    }
  }
  return best?.id ?? null;
}

export type ModelPriceTier = 'cheap' | 'standard' | 'premium';

// Категория "по стоимости" считается ОТНОСИТЕЛЬНО текущей загруженной группы моделей (chat/
// images/videos) по перцентилям цены, а не фиксированными порогами в рублях — абсолютные цены за
// токен/картинку/секунду видео отличаются на порядки, единый порог не имел бы смысла сразу для
// всех групп. costs — отсортированный по возрастанию массив всех цен группы (см. AiModelPicker).
export function modelPriceTierRelative(cost: number | null, sortedCosts: number[]): ModelPriceTier {
  if (cost == null || sortedCosts.length === 0) return 'standard';
  const p33 = sortedCosts[Math.floor(sortedCosts.length * 0.33)];
  const p75 = sortedCosts[Math.floor(sortedCosts.length * 0.75)];
  if (cost <= p33) return 'cheap';
  if (cost >= p75) return 'premium';
  return 'standard';
}

export const AI_ACTIVE_CHAT_KEY = 'ai_active_chat_id';

// Режим текущего диалога/композера — определяет какой набор моделей показывать и какой action
// вызывать при отправке (см. Ai.tsx). 'code' использует ту же группу моделей chat, что и обычный
// текстовый режим, но backend подставляет системный промпт код-ревью (см. backend/ai/index.py,
// CODE_SYSTEM_PROMPT).
export type AiMode = 'chat' | 'code' | 'image' | 'video';

export const MODE_TABS: { id: AiMode; label: string; icon: string; modelGroup: 'chat' | 'images' | 'videos' }[] = [
  { id: 'chat', label: 'Чат', icon: 'MessageSquare', modelGroup: 'chat' },
  { id: 'code', label: 'Код', icon: 'Code2', modelGroup: 'chat' },
  { id: 'image', label: 'Изображения', icon: 'Image', modelGroup: 'images' },
  { id: 'video', label: 'Видео', icon: 'Video', modelGroup: 'videos' },
];

export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
export const VIDEO_DURATIONS = [5, 10];