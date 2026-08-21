import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Icon from '@/components/ui/icon';
import type { AiMessage } from './AiTypes';

interface AiMessageListProps {
  messages: AiMessage[];
  sending: boolean;
  error: string;
}

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

export default function AiMessageList({ messages, sending, error }: AiMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  if (messages.length === 0 && !sending) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Icon name="Sparkles" size={32} className="text-primary/50 mb-3" />
        <div className="text-sm text-muted-foreground max-w-sm">
          Задайте вопрос любой модели — GPT, Claude, Gemini, DeepSeek и другим. Выберите модель
          сверху и начните диалог.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 space-y-4">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border'
            }`}
          >
            {m.role === 'assistant' ? (
              <MessageContent content={m.content} />
            ) : (
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
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
  );
}
