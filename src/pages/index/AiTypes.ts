// Общие типы раздела "AI" — вынесены отдельно, переиспользуются между Ai.tsx и его
// под-компонентами (AiChatList/AiModelPicker/AiMessageList/AiComposer). См. AI_MANAGER_PLAN.md.

export interface AiChatSummary {
  id: number;
  title: string;
  mode: AiMode;
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
  // text — извлечённое на backend содержимое обычных текстовых файлов (.txt/.csv/.json/.md и
  // т.п.), см. backend/ai/index.py _extract_attachment_text — так модель может прочитать файл
  // без специального multi-part формата, как у картинок/PDF. Фронту само поле не нужно для
  // отображения (превью показывает просто иконку файла), но приходит в объекте с backend.
  text?: string;
}

export interface AiMessageSource {
  fileId: number;
  fileName: string;
  fileUrl: string;
  quote: string;
}

export interface AiAgentStep {
  tool: 'search' | 'read' | 'list';
  arg: string;
  found: number;
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
  // hasDocSpec — у сообщения сохранена структура собранного офисного документа, значит его можно
  // дорабатывать уточнениями («добавь позиции», «пересчитай с НДС»). Сама структура на фронт не
  // приходит — она нужна только серверу (см. backend/ai/documents.py).
  hasDocSpec?: boolean;
  // sources/agentSteps — только у ответов в сессиях проекта: какие документы ассистент прочитал,
  // чтобы ответить, и что он для этого делал (см. backend/ai/agent.py).
  sources?: AiMessageSource[] | null;
  agentSteps?: AiAgentStep[] | null;
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
  // Возможности моделей ИЗОБРАЖЕНИЙ — каталог AI Tunnel честно сообщает, что именно поддерживает
  // конкретная модель. Раньше композер показывал все параметры всегда, и запрос падал с 400
  // ("не поддерживается соотношение сторон 16:9. Доступные: —"), потому что, например,
  // gpt-image-1-mini вообще не принимает aspect_ratio. Пустой массив = параметр не поддерживается,
  // поле ОТСУТСТВУЕТ = ограничений нет (показываем весь набор).
  supported_aspect_ratios?: string[];
  supported_quality?: string[];
  supported_output_formats?: string[];
  supported_background?: string[];
  max_n?: number;
  // Возможности моделей ВИДЕО (см. docs/ai-tunnel-api-reference.md, раздел про /v1/videos).
  // supported_durations у каждой модели свои: veo-3.1 принимает только 4/6/8 секунд, hailuo-2.3 —
  // 6/10, поэтому жёсткий список [5, 10] в UI давал невалидные запросы.
  supported_durations?: number[];
  supported_resolutions?: string[];
  supported_frame_images?: string[];
  supports_input_references?: boolean;
  // generate_audio: true — звук можно переключать, false — модель никогда не делает звук
  // (передача параметра = ошибка 400), null/нет поля — переключатель не документирован.
  generate_audio?: boolean | null;
}

export type AiModelsMap = Record<string, AiModelInfo>;

// Результат поиска по содержимому переписки (backend action=search_messages) — снипет вокруг
// найденного слова плюс ссылка на диалог/сообщение, чтобы открыть и подсветить его.
export interface AiMessageSearchResult {
  messageId: number;
  chatId: number;
  chatTitle: string;
  role: 'user' | 'assistant' | 'system';
  snippet: string;
  createdAt: string | null;
}

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
  'x-ai': 'xAI',
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
  'bytedance-seed': 'ByteDance Seed',
  aion: 'Aion Labs',
  'aion-labs': 'Aion Labs',
  sber: 'Sber',
  aitunnel: 'AI Tunnel',
  // Провайдеры моделей изображений и видео — без этих подписей две трети каталога картинок
  // группировались под техническими идентификаторами вида "black-forest-labs"/"sourceful", и
  // выбор выглядел скудным, хотя моделей на самом деле 26.
  'black-forest-labs': 'Black Forest Labs (FLUX)',
  krea: 'Krea',
  recraft: 'Recraft',
  sourceful: 'Sourceful (Riverflow)',
  runway: 'Runway',
  kwaivgi: 'Kling (KwaiVGI)',
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
export type AiMode = 'chat' | 'code' | 'document' | 'image' | 'video';

// document использует те же текстовые модели, что chat/code: модель отдаёт СТРУКТУРУ документа
// в JSON, а сам .xlsx/.docx собирается на сервере (backend/ai/documents.py).
export const MODE_TABS: { id: AiMode; label: string; icon: string; modelGroup: 'chat' | 'images' | 'videos' }[] = [
  { id: 'chat', label: 'Чат', icon: 'MessageSquare', modelGroup: 'chat' },
  { id: 'code', label: 'Код', icon: 'Code2', modelGroup: 'chat' },
  { id: 'document', label: 'Документы', icon: 'FileSpreadsheet', modelGroup: 'chat' },
  { id: 'image', label: 'Изображения', icon: 'Image', modelGroup: 'images' },
  { id: 'video', label: 'Видео', icon: 'Video', modelGroup: 'videos' },
];

// Форматы, которые умеет собирать backend/ai/documents.py. 'auto' — модель решает по смыслу
// запроса (таблица/расчёт → xlsx, письмо/регламент → docx).
export const DOCUMENT_FORMATS: { value: string; label: string; icon: string }[] = [
  { value: 'auto', label: 'Авто', icon: 'Wand2' },
  { value: 'xlsx', label: 'Excel', icon: 'FileSpreadsheet' },
  { value: 'docx', label: 'Word', icon: 'FileText' },
];

export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
export const VIDEO_DURATIONS = [5, 10];

// Параметры генерации изображений (POST /images/generations, см.
// docs/ai-tunnel-api-reference.md) — универсальные для всех моделей: модель без поддержки
// конкретного значения просто проигнорирует его, ошибки не будет (кроме background — см. ниже).
export const IMAGE_QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Авто' },
  { value: 'low', label: 'Низкое (дешевле)' },
  { value: 'medium', label: 'Среднее' },
  { value: 'high', label: 'Высокое (дороже)' },
];

export const IMAGE_OUTPUT_FORMATS: { value: string; label: string }[] = [
  { value: '', label: 'Авто' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
];

export const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4];

// Какие параметры генерации реально доступны у ВЫБРАННОЙ модели изображений. Источник истины —
// живой каталог AI Tunnel (см. AiModelInfo), ничего не хардкодим по именам моделей.
// Правило чтения каталога:
//   - поля НЕТ (модель ещё не описана в каталоге / выбрано "auto") → ограничений не знаем,
//     показываем весь набор как раньше;
//   - поле есть и ПУСТОЕ → параметр моделью не поддерживается, скрываем его из UI;
//   - поле есть и заполнено → показываем ровно те значения, что перечислены.
// Без этого композер отправлял, например, aspect_ratio модели gpt-image-1-mini, которая его не
// принимает, и запрос падал с 400 "не поддерживается соотношение сторон".
export interface ImageModelCapabilities {
  aspectRatios: string[];
  qualities: { value: string; label: string }[];
  outputFormats: { value: string; label: string }[];
  supportsTransparent: boolean;
  maxCount: number;
}

// Возможности ВЫБРАННОЙ модели видео — читаются из того же живого каталога AI Tunnel.
// Особенно важны длительности: они у моделей разные (veo-3.1 — только 4/6/8 секунд, hailuo-2.3 —
// 6/10), и жёсткий список в UI приводил к невалидным запросам.
export interface VideoModelCapabilities {
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  /** Какие опорные кадры принимает модель: 'first_frame' и/или 'last_frame'. */
  frameTypes: string[];
  supportsReferences: boolean;
  /** true — звук можно выключать; false/undefined — переключатель не показываем. */
  canToggleAudio: boolean;
  /** Умеет ли модель править ИСХОДНОЕ ВИДЕО (video-to-video) — есть 'video' во входных модальностях. */
  supportsVideoInput: boolean;
}

export function videoModelCapabilities(info: AiModelInfo | undefined): VideoModelCapabilities {
  return {
    durations: info?.supported_durations?.length ? [...info.supported_durations].sort((a, b) => a - b) : VIDEO_DURATIONS,
    aspectRatios: info?.supported_aspect_ratios ?? [],
    resolutions: info?.supported_resolutions ?? [],
    frameTypes: info?.supported_frame_images ?? [],
    supportsReferences: !!info?.supports_input_references,
    canToggleAudio: info?.generate_audio === true,
    supportsVideoInput: !!info?.modalities?.input?.includes('video'),
  };
}

export function imageModelCapabilities(info: AiModelInfo | undefined): ImageModelCapabilities {
  const listOrAll = <T>(supported: string[] | undefined, all: T[], match: (item: T) => string): T[] => {
    if (supported === undefined) return all;
    if (supported.length === 0) return [];
    return all.filter((item) => supported.includes(match(item)));
  };

  return {
    // 'auto' из каталога в выпадающем списке не показываем — это и есть поведение "не передавать
    // параметр", которое у нас выражено отсутствием выбора.
    aspectRatios: info?.supported_aspect_ratios === undefined
      ? IMAGE_ASPECT_RATIOS
      : info.supported_aspect_ratios.filter((r) => r !== 'auto'),
    qualities: listOrAll(info?.supported_quality, IMAGE_QUALITY_OPTIONS, (q) => q.value || 'auto'),
    outputFormats: listOrAll(info?.supported_output_formats, IMAGE_OUTPUT_FORMATS, (f) => f.value || 'auto'),
    supportsTransparent: info?.supported_background === undefined || info.supported_background.includes('transparent'),
    maxCount: info?.max_n ?? Math.max(...IMAGE_COUNT_OPTIONS),
  };
}