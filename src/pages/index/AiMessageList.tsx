import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AiMessage, AiMode } from './AiTypes';

interface AiMessageListProps {
  messages: AiMessage[];
  sending: boolean;
  error: string;
  mode: AiMode;
  onTogglePinned: (messageId: number, pinned: boolean) => void;
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

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');
  if (!match) {
    return <code className="px-1 py-0.5 rounded bg-secondary/80 text-[13px] font-mono">{code}</code>;
  }
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/60 text-[11px] text-muted-foreground">
        <span className="font-mono">{match[1]}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <Icon name="Copy" size={11} />
          Копировать
        </button>
      </div>
      <SyntaxHighlighter language={match[1]} style={atomDark} customStyle={{ margin: 0, fontSize: '13px' }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children }) => <CodeBlock className={className}>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MessageAttachments({ message }: { message: AiMessage }) {
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
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
            <img src={a.url} alt={a.name} className="max-w-[260px] max-h-[260px] rounded-lg border border-border object-cover" />
          </a>
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
// закрепление полезных ответов для быстрого поиска в длинной переписке).
function PinnedPanel({ pinnedMessages, onJump }: { pinnedMessages: AiMessage[]; onJump: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  if (pinnedMessages.length === 0) return null;
  return (
    <div className="px-4 sm:px-6 pt-3">
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
    </div>
  );
}

export default function AiMessageList({ messages, sending, error, mode, onTogglePinned }: AiMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

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
          <div className="mt-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-2 max-w-sm">
            <Icon name="AlertCircle" size={14} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PinnedPanel pinnedMessages={pinnedMessages} onJump={jumpToMessage} />
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              ref={(el) => { if (el) messageRefs.current.set(m.id, el); else messageRefs.current.delete(m.id); }}
              className={`group/msg relative max-w-[85%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm transition-shadow ${
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
              <MessageAttachments message={m} />
              {m.role === 'assistant' ? (
                m.content && <MessageContent content={m.content} />
              ) : (
                m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>
              )}
              {m.role === 'assistant' && m.model && (
                <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-2">
                  <span className="font-mono">{m.model}</span>
                  {m.costRub != null && m.costRub > 0 && <span>· {m.costRub.toFixed(2)} ₽</span>}
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
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-2">
              <Icon name="AlertCircle" size={14} className="shrink-0" />
              {error}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
