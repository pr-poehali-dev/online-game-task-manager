import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import AiTemplatesPicker from './AiTemplatesPicker';
import { useAutosizeTextarea } from './useAutosizeTextarea';
import { DOCUMENT_FORMATS } from './AiTypes';
import type { AiPromptTemplate } from './AiPromptTemplates';
import type { AiUsage, AiAttachment, AiMode } from './AiTypes';

const COMPACT_MAX_HEIGHT = 160; // прежнее поведение (max-h-40)
const EXPANDED_MAX_HEIGHT = 480; // ~ половина экрана ноутбука — достаточно для длинного промпта

// Популярные форматы, принимаемые в чат (до 200 МБ, см. aiUploadApi.ts/backend/ai/index.py
// MAX_UPLOAD_SIZE): изображения и PDF модель реально "понимает" (vision/native file-parsing),
// видео — только модели с video во входе, обычные текстовые/кодовые файлы (см.
// TEXT_FILE_EXTENSIONS в backend/ai/index.py — .txt/.csv/.php/.py/.log и десятки других) читаются
// как текст и вставляются прямо в запрос. Документы Office/архивы/аудио прикрепляются к
// сообщению и доступны по ссылке в интерфейсе, но не читаются моделью напрямую — это ограничение
// самого AI Tunnel API, не наше. accept — лишь подсказка диалогу выбора файла в браузере, не
// строгий фильтр: пользователь всегда может выбрать "Все файлы".
const ACCEPT_FILES = [
  'image/*', '.pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf',
  '.zip', '.rar', '.7z',
  'audio/*',
  '.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.log', '.sql',
  '.html', '.htm', '.css', '.scss',
  '.py', '.js', '.jsx', '.ts', '.tsx', '.php', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs',
  '.rb', '.swift', '.sh', '.pl', '.lua', '.vue',
].join(',');

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
  uploadProgress: number | null;
  templates: AiPromptTemplate[];
  templatesLoading: boolean;
  onManageTemplates: () => void;
  // Выбранный формат документа в режиме 'document' ('auto' | 'xlsx' | 'docx').
  documentFormat?: string;
  onDocumentFormatChange?: (format: string) => void;
  // hasDocument — в диалоге уже есть собранный документ: следующий запрос будет доработкой.
  hasDocument?: boolean;
}

export default function AiComposer({
  mode, value, onChange, onSend, sending, usage, limitExceeded,
  attachments, onAddFile, onRemoveAttachment, uploading, uploadProgress,
  templates, templatesLoading, onManageTemplates,
  documentFormat = 'auto', onDocumentFormatChange, hasDocument = false,
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
    // В режиме кода Tab должен добавлять отступ, а не уводить фокус с поля: сотрудник правит
    // отступы прямо в поле, и прыжок фокуса ломал набор.
    if (e.key === 'Tab' && mode === 'code') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Многострочный код удобнее отправлять явно (Ctrl/Cmd+Enter): при вставке кода Enter в конце
      // строки слишком легко нажать случайно и отправить незаконченный фрагмент.
      if (mode === 'code' && value.includes('\n') && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!sending && !limitExceeded && value.trim()) onSend();
    }
  }

  // Вставка большого фрагмента (кода, лога) сразу раскрывает поле на всю доступную высоту —
  // иначе он схлопывался в узкую полоску и его нельзя было просмотреть перед отправкой.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData('text');
    if (!expanded && (pasted.match(/\n/g)?.length ?? 0) >= 4) setExpanded(true);
  }

  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;
  // В режиме кода подсказка зависит от того, набран ли уже многострочный фрагмент: для него
  // Enter больше не отправляет сообщение (см. handleKeyDown), и об этом надо сказать прямо.
  const placeholder = mode === 'code'
    ? value.includes('\n')
      ? 'Ctrl+Enter — отправить, Tab — отступ'
      : 'Вставьте код или опишите задачу… (Enter — отправить, Tab — отступ)'
    : mode === 'document'
      ? hasDocument
        // Документ в диалоге уже есть — следующее сообщение будет доработкой, а не новым файлом.
        ? 'Что поправить в документе? «добавь три позиции», «пересчитай с НДС 20%»…'
        : 'Опишите документ: «смета на ремонт офиса, 10 позиций с ценами»…'
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
      {uploading && uploadProgress != null && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
          </div>
          <span>Загрузка файла… {Math.round(uploadProgress * 100)}%</span>
        </div>
      )}
      {mode === 'document' && hasDocument && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Следующее сообщение доработает уже созданный документ. Чтобы сделать новый — начните новый диалог.
        </div>
      )}
      {/* Формат выбирается только для НОВОГО документа: при доработке он наследуется от исходного
          файла, иначе таблица могла бы неожиданно превратиться в текстовый документ. */}
      {mode === 'document' && !hasDocument && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-0.5">Формат:</span>
          {DOCUMENT_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onDocumentFormatChange?.(f.value)}
              className={`h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                documentFormat === f.value
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={f.icon} size={12} />
              {f.label}
            </button>
          ))}
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
                  <Icon
                    name={a.contentType.startsWith('video/') ? 'Video' : a.contentType.startsWith('audio/') ? 'Music' : a.contentType === 'application/pdf' ? 'FileText' : 'File'}
                    size={16}
                    className="text-muted-foreground"
                  />
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
          accept={ACCEPT_FILES}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddFile(f); e.target.value = ''; }}
        />
        {/* В режиме документов вложения не участвуют: запрос уходит отдельным действием
            generate_document, которое принимает только текстовое описание. */}
        {mode !== 'document' && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Прикрепить файл или картинку"
            className="h-[42px] w-[42px] shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {uploading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Paperclip" size={16} />}
          </button>
        )}
        <AiTemplatesPicker
          mode={mode}
          templates={templates}
          loading={templatesLoading}
          onSelect={onChange}
          onManage={onManageTemplates}
          hasDraft={!!value.trim()}
        />
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={sending || limitExceeded}
            spellCheck={mode !== 'code'}
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