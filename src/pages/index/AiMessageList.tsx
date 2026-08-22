import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AiCodeBlock from './AiCodeBlock';
import AiCodeDiff from './AiCodeDiff';
import { findComparablePair } from './aiCodeDiff';
import { exportPinnedMessages } from './aiExportPinned';
import AiImageLightbox from './AiImageLightbox';
import type { AiMessage, AiMode } from './AiTypes';

interface AiMessageListProps {
  messages: AiMessage[];
  sending: boolean;
  error: string;
  mode: AiMode;
  chatTitle: string;
  onTogglePinned: (messageId: number, pinned: boolean) => void;
  // onRetry — переотправка последнего упавшего запроса (см. retryAction в Ai.tsx). Не передаётся,
  // когда повтор невозможен или бессмыслен (исчерпан лимит, уже запущенная генерация видео).
  onRetry?: () => void;
  // onRegenerate — перегенерация последнего ответа ассистента. Передаётся только в текстовых
  // режимах (chat/code): для картинок и видео "перегенерация" — это обычный новый платный запуск.
  onRegenerate?: () => void;
}

const EMPTY_STATE: Record<AiMode, { icon: string; text: string }> = {
  chat: {
    icon: 'Sparkles',
    text: 'Задайте вопрос любой модели — GPT, Claude, Gemini, DeepSeek и другим. Выберите модель сверху и начните диалог.',
  },
  code: {
    icon: 'Code2',
    text: 'Вставьте код или опишите задачу — ассистент поможет с код-ревью, рефакторингом и поиском багов.',
  },
  image: {
    icon: 'Image',
    text: 'Опишите изображение текстом внизу — модель сгенерирует его за несколько секунд.',
  },
  video: {
    icon: 'Video',
    text: 'Опишите видео текстом внизу — генерация обычно занимает несколько минут, деньги списываются сразу при запуске.',
  },
};

// Отличить блок кода от инлайнового `кода` ТОЛЬКО по className нельзя: в react-markdown v10 проп
// `inline` убран, а у блока без указания языка (```\n...\n```) className пустой — ровно как у
// инлайна. Из-за этого многострочные блоки без языка рендерились как крохотный инлайн-код и
// теряли переносы строк, хотя модели пишут так постоянно. Правильный признак — родительский узел:
// у настоящего блока это <pre>. Дополнительно считаем блоком всё многострочное.
function CodeRenderer({ className, children }: { className?: string; children: React.ReactNode }) {
  const match = /language-([\w+#-]+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');
  const isBlock = !!match || code.includes('\n');
  if (!isBlock) {
    return <code className="px-1 py-0.5 rounded bg-secondary/80 text-[13px] font-mono break-words">{code}</code>;
  }
  return <AiCodeBlock language={match ? match[1] : null} code={code} />;
}

// Кнопка «Сравнить с исходным» под ответом в режиме кода: сопоставляет код из вопроса сотрудника
// с исправленной версией из ответа модели. Показывается только когда пара реально найдена
// (см. findComparablePair), чтобы не мозолить глаза в обычной переписке.
function DiffToggle({ before, after }: { before: string; after: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Icon name="GitCompare" size={12} />
        Сравнить с исходным
      </button>
    );
  }
  return <AiCodeDiff before={before} after={after} title="Что изменилось" onClose={() => setOpen(false)} />;
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 prose-headings:mt-3 prose-headings:mb-1.5 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children }) => <CodeRenderer className={className}>{children}</CodeRenderer>,
          // <pre> отдаём как есть: собственную рамку и фон рисует AiCodeBlock внутри.
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{children}</a>
          ),
          // Таблицы из markdown (remark-gfm) без обёртки со скроллом ломали ширину сообщения.
          table: ({ children }) => (
            <div className="overflow-x-auto scrollbar-thin my-2">
              <table className="text-xs">{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// RetryButton — переотправка упавшего запроса без ручного перенабора промпта и перевыбора
// вложений. Показывается прямо под текстом ошибки (см. retryAction в Ai.tsx).
function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      onClick={onRetry}
      className="mt-2 flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
    >
      <Icon name="RotateCw" size={12} />
      Повторить
    </button>
  );
}

// CopyAnswerButton — копирование ВСЕГО ответа ассистента одной кнопкой. Отдельно от кнопки
// "Копировать" внутри блоков кода (CodeBlock): та копирует только сам сниппет, а сотруднику часто
// нужен ответ целиком — вставить в задачу, письмо или документ.
function CopyAnswerButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={copied ? 'Скопировано' : 'Копировать ответ целиком'}
      className={`absolute -top-2 right-5 h-6 w-6 rounded-full flex items-center justify-center border transition-opacity ${
        copied
          ? 'opacity-100 bg-emerald-500 border-emerald-500 text-white'
          : 'opacity-0 group-hover/msg:opacity-100 bg-card border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon name={copied ? 'Check' : 'Copy'} size={11} />
    </button>
  );
}

function MessageAttachments({ message, onOpenImage }: { message: AiMessage; onOpenImage: (url: string, name: string) => void }) {
  const atts = message.attachments || [];
  if (atts.length === 0 && message.jobStatus === 'pending') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Icon name="Loader2" size={14} className="animate-spin" />
        Генерация видео… обычно занимает несколько минут
      </div>
    );
  }
  if (atts.length === 0 && message.jobStatus === 'failed') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-2">
        <Icon name="AlertCircle" size={14} />
        Генерация не удалась
      </div>
    );
  }
  if (atts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-1.5">
      {atts.map((a) => (
        a.contentType.startsWith('image/') ? (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenImage(a.url, a.name)}
            className="group relative"
          >
            <img src={a.url} alt={a.name} className="max-w-[260px] max-h-[260px] rounded-lg border border-border object-cover" />
            <span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Icon name="Expand" size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </button>
        ) : a.contentType.startsWith('video/') ? (
          <video key={a.id} src={a.url} controls className="max-w-[320px] rounded-lg border border-border" />
        ) : (
          <a
            key={a.id} href={a.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs hover:bg-secondary transition-colors"
          >
            <Icon name="FileText" size={13} />
            {a.name}
          </a>
        )
      ))}
    </div>
  );
}

// PinnedPanel — компактная кнопка-счётчик над лентой сообщений, при клике показывает список
// закреплённых ответов ассистента с переходом к нужному по клику (см. AI_MANAGER_PLAN.md:
// закрепление полезных ответов для быстрого поиска в длинной переписке) плюс кнопку экспорта всех
// закреплённых ответов в текстовый файл для составления сводки.
function PinnedPanel({ pinnedMessages, chatTitle, onJump }: { pinnedMessages: AiMessage[]; chatTitle: string; onJump: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  if (pinnedMessages.length === 0) return null;
  return (
    <div className="px-4 sm:px-6 pt-3 flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/15 transition-colors">
            <Icon name="Pin" size={12} />
            Закреплено: {pinnedMessages.length}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1.5" align="start">
          <div className="space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin">
            {pinnedMessages.map((m) => (
              <button
                key={m.id}
                onClick={() => { onJump(m.id); setOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors truncate"
              >
                {m.content ? m.content.slice(0, 100) : 'Вложение без текста'}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={() => exportPinnedMessages(chatTitle, pinnedMessages)}
        title="Скачать все закреплённые ответы в текстовый файл"
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Icon name="Download" size={12} />
        Экспорт
      </button>
    </div>
  );
}

export default function AiMessageList({ messages, sending, error, mode, chatTitle, onTogglePinned, onRetry, onRegenerate }: AiMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  // Перегенерировать можно только САМЫЙ последний ответ ассистента — переписывать середину
  // диалога нельзя, иначе последующие сообщения потеряют смысл (backend тоже удаляет строго
  // последнее сообщение, см. action=regenerate).
  const lastMessage = messages[messages.length - 1];
  const regenerableId = lastMessage?.role === 'assistant' && lastMessage.content && lastMessage.id > 0 ? lastMessage.id : null;

  // diffPairs — для каждого ответа ассистента в режиме кода ищем, с чем его сравнивать: берём
  // предшествующее сообщение сотрудника и сопоставляем блоки кода. Считаем один раз на список,
  // а не при каждом рендере строки, т.к. разбор markdown не бесплатный.
  const diffPairs = useMemo(() => {
    const map = new Map<number, { before: string; after: string }>();
    if (mode !== 'code') return map;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== 'assistant' || !m.content) continue;
      const prevUser = [...messages.slice(0, i)].reverse().find((x) => x.role === 'user' && x.content);
      if (!prevUser?.content) continue;
      const pair = findComparablePair(prevUser.content, m.content);
      if (pair) map.set(m.id, pair);
    }
    return map;
  }, [messages, mode]);

  function jumpToMessage(id: number) {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1500);
  }

  if (messages.length === 0 && !sending) {
    const empty = EMPTY_STATE[mode];
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Icon name={empty.icon} size={32} className="text-primary/50 mb-3" />
        <div className="text-sm text-muted-foreground max-w-sm">{empty.text}</div>
        {error && (
          <div className="mt-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3.5 py-2.5 text-sm max-w-sm">
            <div className="flex items-center gap-2">
              <Icon name="AlertCircle" size={14} className="shrink-0" />
              {error}
            </div>
            {onRetry && <RetryButton onRetry={onRetry} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PinnedPanel pinnedMessages={pinnedMessages} chatTitle={chatTitle} onJump={jumpToMessage} />
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              ref={(el) => { if (el) messageRefs.current.set(m.id, el); else messageRefs.current.delete(m.id); }}
              /* Сообщение со сравнением делаем шире: две колонки кода в узком пузыре нечитаемы. */
              className={`group/msg relative rounded-xl px-3.5 py-2.5 text-sm transition-shadow ${
                diffPairs.has(m.id) ? 'max-w-full w-full' : 'max-w-[85%] sm:max-w-[75%]'
              } ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              } ${highlightedId === m.id ? 'ring-2 ring-amber-500' : ''} ${m.pinned ? 'border-amber-500/40' : ''}`}
            >
              {m.role === 'assistant' && (m.content || (m.attachments && m.attachments.length > 0)) && (
                <button
                  onClick={() => onTogglePinned(m.id, !m.pinned)}
                  title={m.pinned ? 'Открепить ответ' : 'Закрепить ответ'}
                  className={`absolute -top-2 -right-2 h-6 w-6 rounded-full flex items-center justify-center border transition-opacity ${
                    m.pinned
                      ? 'opacity-100 bg-amber-500 border-amber-500 text-white'
                      : 'opacity-0 group-hover/msg:opacity-100 bg-card border-border text-muted-foreground hover:text-amber-600'
                  }`}
                >
                  <Icon name="Pin" size={11} />
                </button>
              )}
              {m.role === 'assistant' && m.content && <CopyAnswerButton content={m.content} />}
              <MessageAttachments message={m} onOpenImage={(url, name) => setLightboxImage({ url, name })} />
              {m.role === 'assistant' ? (
                m.content && (
                  <>
                    <MessageContent content={m.content} />
                    {diffPairs.has(m.id) && (
                      <DiffToggle before={diffPairs.get(m.id)!.before} after={diffPairs.get(m.id)!.after} />
                    )}
                  </>
                )
              ) : (
                m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>
              )}
              {m.role === 'assistant' && m.model && (
                <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{m.model}</span>
                  {m.costRub != null && m.costRub > 0 && <span>· {m.costRub.toFixed(2)} ₽</span>}
                  {onRegenerate && regenerableId === m.id && !sending && (
                    <button
                      onClick={onRegenerate}
                      title="Ответить заново. Выберите другую модель в шапке, чтобы сравнить ответы"
                      className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <Icon name="RefreshCw" size={11} />
                      Ответить заново
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="Loader2" size={14} className="animate-spin" />
              Модель думает…
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-start">
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3.5 py-2.5 text-sm max-w-[85%] sm:max-w-[75%]">
              <div className="flex items-center gap-2">
                <Icon name="AlertCircle" size={14} className="shrink-0" />
                {error}
              </div>
              {onRetry && <RetryButton onRetry={onRetry} />}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {lightboxImage && (
        <AiImageLightbox url={lightboxImage.url} name={lightboxImage.name} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}