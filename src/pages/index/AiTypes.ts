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
}

// Одна модель из публичного каталога AI Tunnel (GET /public/aitunnel/models/chat) — ключ объекта
// в ответе API — имя модели для поля model в запросе (см. docs/ai-tunnel-api-reference.md).
export interface AiModelInfo {
  provider: string;
  prompt_cost?: number;
  completion_cost?: number;
  context_size?: number;
  max_output?: number;
  description?: string;
  modalities?: { input?: string[]; output?: string[] };
  created?: number;
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