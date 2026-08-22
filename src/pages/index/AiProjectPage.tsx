import { useState } from 'react';
import Icon from '@/components/ui/icon';
import AiProjectSettings from './AiProjectSettings';
import AiProjectSearch from './AiProjectSearch';
import AiProjectFiles from './AiProjectFiles';
import type { AiProjectsState } from './useAiProjects';

interface AiProjectPageProps {
  state: AiProjectsState;
  // Открыть диалог проекта в обычной ленте переписки.
  onOpenChat: (chatId: number) => void;
  // Начать новую сессию внутри проекта — создаётся при первой отправке сообщения.
  onStartSession: () => void;
  // Загрузка ПАЧКОЙ: сотрудник может выбрать или перетащить целую папку.
  onUploadFiles: (files: File[]) => void;
  uploading: boolean;
  uploadProgress: number | null;
  uploadQueue: { done: number; total: number; name: string } | null;
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
  onUploadFiles,
  uploading,
  uploadProgress,
  uploadQueue,
}: AiProjectPageProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const project = state.activeProject;

  if (state.detailLoading && !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Icon name="Loader2" size={20} className="animate-spin text-primary" />
      </div>
    );
  }
  if (!project) return null;

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

              {/* Автосводка — ассистент сам читает документы и коротко описывает, что внутри.
                  Пересобирается только при изменении состава файлов, поэтому открытие проекта не
                  стоит денег. */}
              {(project.filesCount > 0 || project.summary) && (
                <div className="rounded-xl border border-border bg-card/40 p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="Sparkles" size={13} className="shrink-0 text-primary" />
                    <span className="text-xs font-medium">О чём этот проект</span>
                    {state.summaryLoading ? (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Icon name="Loader2" size={11} className="animate-spin" />
                        Читаю документы…
                      </span>
                    ) : (
                      <button
                        onClick={() => state.refreshSummary(true)}
                        title="Пересобрать описание по документам"
                        className="ml-auto h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Icon name="RefreshCw" size={11} />
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-foreground/85 leading-relaxed">
                    {project.summary
                      ? project.summary
                      : state.summaryLoading
                        ? 'Ассистент просматривает файлы проекта…'
                        : state.indexing
                          ? 'Описание появится, когда файлы будут прочитаны'
                          : 'Добавьте файлы — ассистент опишет, что в них'}
                  </div>
                  {project.summaryUpdatedAt && !state.summaryLoading && (
                    <div className="text-[10px] text-muted-foreground mt-1.5">
                      Обновлено {new Date(project.summaryUpdatedAt).toLocaleDateString('ru-RU')}
                    </div>
                  )}
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
            <AiProjectFiles
              state={state}
              onUploadFiles={onUploadFiles}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadQueue={uploadQueue}
            />
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
                  {project.summary || 'Добавьте файлы в проект — ассистент сам опишет, что в них'}
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
          {project.summary && (
            <div>
              <div className="text-xs font-medium mb-1.5">Сводка</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{project.summary}</div>
            </div>
          )}
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
