import { useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
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
  // documentTemplate — загруженный бланк сотрудника: ассистент заполнит именно его, сохранив
  // оформление, вместо сборки документа с нуля.
  documentTemplate?: AiAttachment | null;
  onDocumentTemplateChange?: (attachment: AiAttachment | null) => void;
  onUploadTemplate?: (file: File) => void;
}

export default function AiComposer({
  mode, value, onChange, onSend, sending, usage, limitExceeded,
  attachments, onAddFile, onRemoveAttachment, uploading, uploadProgress,
  templates, templatesLoading, onManageTemplates,
  documentFormat = 'auto', onDocumentFormatChange, hasDocument = false,
  documentTemplate = null, onDocumentTemplateChange, onUploadTemplate,
}: AiComposerProps) {
  // На телефоне подсказки в поле короче: длинный текст про Enter там не нужен (отправка кнопкой)
  // и занимал две строки, вытесняя само поле ввода.
  const isNarrow = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
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
      : isNarrow ? 'Вставьте код или опишите задачу…' : 'Вставьте код или опишите задачу… (Enter — отправить, Tab — отступ)'
    : mode === 'document'
      ? documentTemplate
        ? 'Какими данными заполнить бланк? «договор с ООО Ромашка на 250 000 ₽»…'
        : hasDocument
          // Документ в диалоге уже есть — следующее сообщение будет доработкой, а не новым файлом.
          ? 'Что поправить в документе? «добавь три позиции», «пересчитай с НДС 20%»…'
          : 'Опишите документ: «смета на ремонт офиса, 10 позиций с ценами»…'
      : isNarrow
        ? 'Спросите ИИ…'
        : 'Напишите сообщение… (Enter — отправить, Shift+Enter — новая строка)';

  return (
    <div className="border-t border-border p-3 sm:p-4 shrink-0">
      {usage && (
        <div className="hidden sm:flex items-center gap-2 mb-1.5 sm:mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div
              className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {/* На телефоне формулировка короче — длинная фраза переносилась на вторую строку */}
          <span className="sm:hidden">{usage.spentRub.toFixed(0)} / {usage.limitRub.toFixed(0)} ₽</span>
          <span className="hidden sm:inline">
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
      {/* Подсказка про доработку не нужна, когда выбран бланк: с ним каждое сообщение заполняет
          бланк заново, а не правит предыдущий результат. */}
      {mode === 'document' && hasDocument && !documentTemplate && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Следующее сообщение доработает уже созданный документ. Чтобы сделать новый — начните новый диалог.
        </div>
      )}
      {/* Загруженный бланк: пока он выбран, документ не собирается с нуля — ассистент заполняет
          именно этот файл, сохраняя его оформление. */}
      {mode === 'document' && documentTemplate && (
        <div className="mb-2 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-primary/40 bg-primary/10">
          <Icon name="FileCheck2" size={14} className="text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{documentTemplate.name}</div>
            <div className="text-[11px] text-muted-foreground">
              Заполню этот бланк, сохранив оформление
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDocumentTemplateChange?.(null)}
            title="Убрать бланк"
            className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="X" size={13} />
          </button>
        </div>
      )}
      {/* Кнопка загрузки бланка доступна всегда в режиме документов — даже если в диалоге уже
          есть собранный файл: сотрудник может в любой момент переключиться на свой бланк.
          Выбор формата показываем только для НОВОГО документа с нуля: при доработке он
          наследуется от исходного файла, а при заполнении бланка берётся из самого бланка. */}
      {mode === 'document' && !documentTemplate && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {!hasDocument && (
            <>
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
            </>
          )}
          <input
            ref={templateInputRef}
            type="file"
            accept=".docx,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadTemplate?.(f); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => templateInputRef.current?.click()}
            disabled={uploading}
            title="Загрузить свой бланк Word или Excel — ассистент заполнит его, сохранив оформление"
            className="h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {uploading ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Upload" size={12} />}
            Свой бланк
          </button>
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
      {/* Блок ввода. На телефоне — ЕДИНАЯ капсула: текст сверху, кнопки внутри снизу (как в
          мобильных чат-приложениях). Раньше поле и кнопки были отдельными блоками с собственными
          рамками, из-за чего низ экрана выглядел нагромождением коробок. На десктопе раскладка
          прежняя: кнопки слева, поле по центру, отправка справа — всё в одну строку. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_FILES}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddFile(f); e.target.value = ''; }}
      />
      <div className="rounded-[22px] border border-border bg-background p-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:flex sm:items-end sm:gap-2">
        <div className="hidden sm:flex items-center gap-2 shrink-0">
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
        </div>
        <div className="relative sm:flex-1 sm:min-w-0">
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
            className="w-full resize-none bg-transparent px-2.5 pt-1.5 pb-0.5 text-base focus:outline-none disabled:opacity-60 overflow-y-auto scrollbar-thin transition-[height] sm:rounded-lg sm:border sm:border-border sm:bg-background sm:px-3 sm:pr-10 sm:py-2.5 sm:text-sm sm:focus:ring-1 sm:focus:ring-primary"
            style={{ minHeight: '32px', maxHeight }}
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Свернуть поле' : 'Увеличить поле'}
            className="hidden sm:flex absolute right-2 bottom-2 h-7 w-7 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={14} />
          </button>
        </div>
        {/* Нижний ряд капсулы (только телефон): вложения и шаблоны слева, отправка справа */}
        <div className="flex items-center gap-1 sm:hidden">
          {mode !== 'document' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Прикрепить файл или картинку"
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {uploading ? <Icon name="Loader2" size={18} className="animate-spin" /> : <Icon name="Paperclip" size={18} />}
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
          {/* Кнопки «увеличить» на телефоне нет: поле и так растёт по мере набора текста, а
              лишняя иконка занимала место в ряду. Показываем только «свернуть» и только когда
              поле уже раскрыто вставкой длинного текста (см. handlePaste) — иначе развёрнутое
              поле нечем было бы вернуть к обычному размеру. */}
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Свернуть поле"
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon name="Minimize2" size={16} />
            </button>
          )}
          <button
            onClick={onSend}
            disabled={sending || limitExceeded || !value.trim()}
            className="ml-auto h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {sending ? <Icon name="Loader2" size={17} className="animate-spin" /> : <Icon name="ArrowUp" size={18} />}
          </button>
        </div>
        <button
          onClick={onSend}
          disabled={sending || limitExceeded || !value.trim()}
          className="hidden sm:flex h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {sending ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
        </button>
      </div>
    </div>
  );
}