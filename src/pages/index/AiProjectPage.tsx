import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { fmtFileSize } from '../admin/adminShared';
import AiProjectSettings from './AiProjectSettings';
import AiProjectSearch from './AiProjectSearch';
import type { AiProjectFile, AiProjectsState } from './useAiProjects';

// Как показывать состояние разбора файла для поиска. unsupported — не ошибка: в картинке или
// видео просто нет текста, файл остаётся в проекте, но в поиске не участвует.
const INDEX_LABELS: Record<string, { icon: string; text: string; className: string }> = {
  pending: { icon: 'Clock', text: 'В очереди', className: 'text-muted-foreground' },
  indexing: { icon: 'Loader2', text: 'Обрабатывается', className: 'text-primary' },
  ready: { icon: 'Check', text: 'Готов к поиску', className: 'text-muted-foreground' },
  unsupported: { icon: 'Minus', text: 'Без текста', className: 'text-muted-foreground' },
  failed: { icon: 'AlertCircle', text: 'Не удалось прочитать', className: 'text-destructive' },
};

function FileIndexBadge({ file }: { file: AiProjectFile }) {
  const state = INDEX_LABELS[file.indexStatus] || INDEX_LABELS.pending;
  return (
    <span className={`shrink-0 hidden sm:flex items-center gap-1 text-[10px] ${state.className}`} title={state.text}>
      <Icon name={state.icon} size={10} className={file.indexStatus === 'indexing' ? 'animate-spin' : ''} />
      {state.text}
    </span>
  );
}

interface AiProjectPageProps {
  state: AiProjectsState;
  // Открыть диалог проекта в обычной ленте переписки.
  onOpenChat: (chatId: number) => void;
  // Начать новую сессию внутри проекта — создаётся при первой отправке сообщения.
  onStartSession: () => void;
  onUploadFile: (file: File) => void;
  uploading: boolean;
  uploadProgress: number | null;
}

type Tab = 'overview' | 'files' | 'search' | 'knowledge' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'files', label: 'Файлы' },
  { id: 'search', label: 'Поиск' },
  { id: 'knowledge', label: 'Знания' },
  { id: 'settings', label: 'Настройки' },
];

// AiProjectPage — страница проекта: шапка с названием, вкладки Обзор/Файлы/Знания/Настройки и
// правая панель с описанием и сводкой (макет из AI_PROJECTS_PLAN.md). Пока это этап 1 плана:
// проект собирает файлы и диалоги, агентная работа с содержимым появится на этапах 2-3.
export default function AiProjectPage({
  state,
  onOpenChat,
  onStartSession,
  onUploadFile,
  uploading,
  uploadProgress,
}: AiProjectPageProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [dragOver, setDragOver] = useState(false);
  const project = state.activeProject;

  if (state.detailLoading && !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Icon name="Loader2" size={20} className="animate-spin text-primary" />
      </div>
    );
  }
  if (!project) return null;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(onUploadFile);
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Шапка проекта */}
      <div className="px-4 sm:px-6 pt-4 pb-0 shrink-0">
        <button
          onClick={() => state.openProject(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <Icon name="ChevronLeft" size={13} />
          К диалогам
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
            <Icon name={project.icon || 'Folder'} size={18} className="text-primary" fallback="Folder" />
          </div>
          <h1 className="font-display text-xl truncate">{project.name}</h1>
          {state.indexing && (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Icon name="Loader2" size={12} className="animate-spin text-primary" />
              Читаю файлы{state.indexPending > 1 ? `: осталось ${state.indexPending}` : '…'}
            </span>
          )}
          {project.archived && (
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
              В архиве
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-border -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-thin">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4">
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Подсказки по настройке проекта — как на референсе Perplexity */}
              {project.filesCount === 0 && (
                <div className="rounded-xl border border-border bg-card/40 divide-y divide-border">
                  <button
                    onClick={() => setTab('files')}
                    className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <Icon name="Upload" size={15} className="shrink-0 mt-0.5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">Добавьте файлы</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Соберите в проекте документы по теме, чтобы обращаться к ним из любой сессии
                      </div>
                    </div>
                    <Icon name="ChevronRight" size={14} className="shrink-0 mt-1 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setTab('knowledge')}
                    className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <Icon name="BookOpen" size={15} className="shrink-0 mt-0.5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">Опишите контекст</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Постоянные инструкции ассистенту, чтобы не повторять их в каждой сессии
                      </div>
                    </div>
                    <Icon name="ChevronRight" size={14} className="shrink-0 mt-1 text-muted-foreground" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Сессии проекта
                </div>
                <button
                  onClick={onStartSession}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  <Icon name="Plus" size={13} />
                  Начать сессию
                </button>
              </div>

              {state.projectChats.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  В проекте пока нет сессий — начните первую
                </div>
              ) : (
                <div className="space-y-1">
                  {state.projectChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => onOpenChat(chat.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-secondary/40 transition-colors"
                    >
                      {chat.pinned && <Icon name="Pin" size={11} className="shrink-0 opacity-70" />}
                      <span className="flex-1 min-w-0 truncate text-sm">{chat.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {chat.updatedAt ? new Date(chat.updatedAt).toLocaleDateString('ru-RU') : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              {/* Загрузка перетаскиванием — самый быстрый способ наполнить проект */}
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border border-dashed cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    Array.from(e.target.files || []).forEach(onUploadFile);
                    e.target.value = '';
                  }}
                />
                {uploading ? (
                  <>
                    <Icon name="Loader2" size={18} className="animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">
                      Загрузка{uploadProgress != null ? `: ${Math.round(uploadProgress * 100)}%` : '…'}
                    </span>
                  </>
                ) : (
                  <>
                    <Icon name="Upload" size={18} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Перетащите файлы сюда или нажмите, чтобы выбрать
                    </span>
                  </>
                )}
              </label>

              {state.projectFiles.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  В проекте пока нет файлов
                </div>
              ) : (
                <div className="space-y-0.5">
                  {state.projectFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors"
                    >
                      <Icon
                        name={file.contentType.startsWith('image/') ? 'Image' : 'File'}
                        size={14}
                        className="shrink-0 text-muted-foreground"
                      />
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 truncate text-sm hover:text-primary transition-colors"
                      >
                        {file.name}
                      </a>
                      <FileIndexBadge file={file} />
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtFileSize(file.size)}</span>
                      <button
                        onClick={() => state.attachFiles([file.id], null)}
                        title="Убрать из проекта (файл останется в «Моих файлах»)"
                        className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                      >
                        <Icon name="X" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'search' && <AiProjectSearch state={state} />}

          {tab === 'knowledge' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <div className="text-xs font-medium mb-1.5">Инструкции ассистенту</div>
                <textarea
                  defaultValue={project.instructions}
                  onBlur={(e) => state.updateProject(project.id, { instructions: e.target.value })}
                  rows={7}
                  placeholder="Например: отвечай кратко, опирайся на документы проекта, суммы указывай в рублях"
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  Подставляется в начало каждой сессии проекта — контекст не нужно повторять руками
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-1.5">Сводка по проекту</div>
                <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5 text-sm text-muted-foreground">
                  {project.summary || 'Сводка появится, когда ассистент научится читать файлы проекта'}
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && <AiProjectSettings state={state} project={project} />}
        </div>

        {/* Правая панель — описание и сводка, как на референсе. Скрыта на узких экранах. */}
        <div className="hidden xl:flex w-72 shrink-0 border-l border-border flex-col gap-4 p-4 overflow-y-auto scrollbar-thin">
          <div>
            <div className="text-xs font-medium mb-1.5">Описание</div>
            <textarea
              defaultValue={project.description}
              onBlur={(e) => state.updateProject(project.id, { description: e.target.value })}
              rows={3}
              placeholder="Опишите проект, цели, тему…"
              className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5">Материалы</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center justify-between">
                <span>Файлов</span>
                <span className="text-foreground">{project.filesCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Занимают</span>
                <span className="text-foreground">{project.filesSizeMb} МБ</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Сессий</span>
                <span className="text-foreground">{project.chatsCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
