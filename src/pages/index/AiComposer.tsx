import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import AiTemplatesPicker from './AiTemplatesPicker';
import { useAutosizeTextarea } from './useAutosizeTextarea';
import type { AiUsage, AiAttachment, AiMode } from './AiTypes';

const COMPACT_MAX_HEIGHT = 160; // прежнее поведение (max-h-40)
const EXPANDED_MAX_HEIGHT = 480; // ~ половина экрана ноутбука — достаточно для длинного промпта

interface AiComposerProps {
  mode: AiMode;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  usage: AiUsage | null;
  limitExceeded: boolean;
  attachments: AiAttachment[];
  onAddFile: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  uploading: boolean;
}

export default function AiComposer({
  mode, value, onChange, onSend, sending, usage, limitExceeded,
  attachments, onAddFile, onRemoveAttachment, uploading,
}: AiComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // expanded — ручное увеличение поля кнопкой (см. скриншот пользователя: маленькое поле ввода
  // неудобно для длинных промптов/кода) — растягивает максимум почти на всю высоту чата.
  // Автоувеличение по мере набора текста работает независимо (useAutosizeTextarea) — expanded
  // лишь поднимает потолок, до которого можно вырасти.
  const [expanded, setExpanded] = useState(false);
  const maxHeight = expanded ? EXPANDED_MAX_HEIGHT : COMPACT_MAX_HEIGHT;
  useAutosizeTextarea(textareaRef, value, maxHeight, expanded);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && !limitExceeded && value.trim()) onSend();
    }
  }

  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;
  const placeholder = mode === 'code'
    ? 'Вставьте код или опишите задачу… (Enter — отправить, Shift+Enter — новая строка)'
    : 'Напишите сообщение… (Enter — отправить, Shift+Enter — новая строка)';

  return (
    <div className="border-t border-border p-3 sm:p-4">
      {usage && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div
              className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <span>
            Потрачено {usage.spentRub.toFixed(2)} ₽ из {usage.limitRub.toFixed(0)} ₽ в этом месяце
          </span>
        </div>
      )}
      {limitExceeded && (
        <div className="mb-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} />
          Месячный лимит на AI исчерпан — обратитесь к администратору для увеличения лимита
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              {a.contentType.startsWith('image/') ? (
                <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover border border-border" />
              ) : (
                <div className="h-14 w-14 rounded-lg border border-border flex flex-col items-center justify-center gap-0.5 bg-secondary/50 px-1">
                  <Icon name="FileText" size={16} className="text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground truncate max-w-full">{a.name}</span>
                </div>
              )}
              <button
                onClick={() => onRemoveAttachment(a.id)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon name="X" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddFile(f); e.target.value = ''; }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Прикрепить файл или картинку"
          className="h-[42px] w-[42px] shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {uploading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Paperclip" size={16} />}
        </button>
        <AiTemplatesPicker mode={mode} onSelect={onChange} hasDraft={!!value.trim()} />
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || limitExceeded}
            placeholder={placeholder}
            rows={1}
            className="w-full resize-none rounded-lg border border-border bg-background pl-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 overflow-y-auto scrollbar-thin transition-[height]"
            style={{ minHeight: '42px', maxHeight }}
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Свернуть поле' : 'Увеличить поле'}
            className="absolute right-1.5 bottom-1.5 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={13} />
          </button>
        </div>
        <button
          onClick={onSend}
          disabled={sending || limitExceeded || !value.trim()}
          className="h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {sending ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
        </button>
      </div>
    </div>
  );
}