import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog } from '@/lib/catalog';
import type { Task, TeamMember, TaskOutcome, Sprint } from './shared';
import { resolveAssignee, taskAssigneeIds, taskServerIds, outcomes, outcomeMeta, AssigneeStack, ServerBadge, formatMskDateTime } from './shared';

type ArchiveTab = 'tasks' | 'sprints';

// Порядок задач в архиве. По умолчанию — самые недавно закрытые сверху: в архив чаще всего
// заходят за тем, что закрыли только что.
type ArchiveSort = 'date_desc' | 'date_asc';

const ARCHIVE_SORTS: { id: ArchiveSort; label: string; icon: string }[] = [
  { id: 'date_desc', label: 'Сначала новые', icon: 'ArrowDownWideNarrow' },
  { id: 'date_asc', label: 'Сначала старые', icon: 'ArrowUpWideNarrow' },
];

export default function Archive({
  tasks,
  total,
  team,
  outcomeFilter,
  onOutcomeFilter,
  onCardClick,
  onRestore,
  onDelete,
  isAdmin,
  archivedSprints,
  onRestoreSprint,
  onDeleteSprint,
}: {
  tasks: Task[];
  total: number;
  team: TeamMember[];
  outcomeFilter: TaskOutcome | 'all';
  onOutcomeFilter: (o: TaskOutcome | 'all') => void;
  onCardClick: (t: Task) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  archivedSprints: Sprint[];
  onRestoreSprint: (id: string) => void;
  onDeleteSprint: (id: string) => void;
}) {
  const { categoryMeta, serverMeta } = useCatalog();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmSprintId, setConfirmSprintId] = useState<string | null>(null);
  const [tab, setTab] = useState<ArchiveTab>('tasks');
  const [sort, setSort] = useState<ArchiveSort>('date_desc');
  // Фильтр по серверу ВНУТРИ архива: выбран конкретный сервер — показываем только его задачи.
  const [serverFilter, setServerFilter] = useState<string>('all');

  // Сервер показываем в фильтре, только если в архиве реально есть его задачи — пустые кнопки
  // по всему списку серверов только мешали бы.
  const serversInArchive = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => taskServerIds(t).forEach((id) => ids.add(id)));
    return [...ids].sort((a, b) => serverMeta(a).label.localeCompare(serverMeta(b).label, 'ru'));
  }, [tasks, serverMeta]);

  // Дата закрытия есть не у всех задач: те, что закрыли до появления этого поля, сортируем по
  // дате создания, иначе они непредсказуемо прыгали бы в конец списка.
  const visibleTasks = useMemo(() => {
    const when = (t: Task) => new Date(t.archivedAt || t.createdAt || 0).getTime();
    return tasks
      .filter((t) => serverFilter === 'all' || taskServerIds(t).includes(serverFilter))
      .sort((a, b) => (sort === 'date_asc' ? when(a) - when(b) : when(b) - when(a)));
  }, [tasks, sort, serverFilter]);

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="max-w-6xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="Archive" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Архив</h2>
        <span className="text-sm text-muted-foreground">
          · {tab === 'tasks' ? `${total} задач` : `${archivedSprints.length} спринтов`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        {tab === 'tasks'
          ? 'Завершённые и закрытые задачи. Можно вернуть любую обратно на доску.'
          : 'Завершённые спринты. Можно вернуть в активные или удалить.'}
      </p>

      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-5 w-fit">
        <button
          onClick={() => setTab('tasks')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="ClipboardList" size={14} />
          Задачи
          <span className="text-xs font-mono opacity-70">{total}</span>
        </button>
        <button
          onClick={() => setTab('sprints')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'sprints' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="Zap" size={14} />
          Спринты
          <span className="text-xs font-mono opacity-70">{archivedSprints.length}</span>
        </button>
      </div>

      {tab === 'tasks' && (
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => onOutcomeFilter('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            outcomeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          Все
        </button>
        {outcomes.map((o) => {
          const active = outcomeFilter === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onOutcomeFilter(o.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
              style={{
                background: active ? `hsl(${o.color} / 0.18)` : 'transparent',
                borderColor: active ? `hsl(${o.color} / 0.5)` : 'hsl(var(--border))',
                color: active ? `hsl(${o.color})` : 'hsl(var(--muted-foreground))',
              }}
            >
              <Icon name={o.icon} size={12} />
              {o.label}
            </button>
          );
        })}

        {/* Порядок вывода: по дате закрытия */}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {ARCHIVE_SORTS.map((o) => (
            <button
              key={o.id}
              onClick={() => setSort(o.id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                sort === o.id
                  ? 'bg-secondary text-foreground border-border'
                  : 'text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Icon name={o.icon} size={12} />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Фильтр по серверу: выбран конкретный — в списке остаются только его задачи.
          Показываем всегда, когда в архиве есть хотя бы один сервер: ряд фильтров должен быть
          на виду, иначе непонятно, что выбор серверов вообще существует. */}
      {tab === 'tasks' && serversInArchive.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button
            onClick={() => setServerFilter('all')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              serverFilter === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            Все серверы
          </button>
          {serversInArchive.map((id) => {
            const m = serverMeta(id);
            const active = serverFilter === id;
            const count = tasks.filter((t) => taskServerIds(t).includes(id)).length;
            return (
              <button
                key={id}
                onClick={() => setServerFilter(id)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
                style={{
                  background: active ? `hsl(${m.color} / 0.18)` : 'transparent',
                  borderColor: active ? `hsl(${m.color} / 0.5)` : 'hsl(var(--border))',
                  color: active ? `hsl(${m.color})` : 'hsl(var(--muted-foreground))',
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${m.color})` }} />
                {m.label}
                <span className="opacity-70 font-mono">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'sprints' && (
        archivedSprints.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Icon name="Zap" size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">В архиве спринтов пока пусто</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {archivedSprints.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors group"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0"
                  style={{ background: 'hsl(215 15% 50% / 0.15)', color: 'hsl(215 15% 60%)' }}
                >
                  <Icon name="CheckCircle2" size={12} />
                  Завершён
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{sp.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatDate(sp.startDate)} — {formatDate(sp.endDate)}
                  </div>
                </div>
                {isAdmin && (confirmSprintId === sp.id ? (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Удалить навсегда?</span>
                    <button
                      onClick={() => { setConfirmSprintId(null); onDeleteSprint(sp.id); }}
                      className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setConfirmSprintId(null)}
                      className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onRestoreSprint(sp.id)}
                      title="Вернуть в активные"
                      className="shrink-0 h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="ArchiveRestore" size={13} />
                      <span className="hidden sm:inline">Вернуть</span>
                    </button>
                    <button
                      onClick={() => setConfirmSprintId(sp.id)}
                      title="Удалить навсегда"
                      className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {/* Пусто по фильтру и пустой архив — разные ситуации: во втором случае подсказываем,
          что список сузил фильтр, и даём вернуться ко всем серверам. */}
      {tab === 'tasks' && (visibleTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Archive" size={40} className="mx-auto mb-3 opacity-40" />
          {serverFilter === 'all' ? (
            <p className="text-sm">В архиве пока пусто</p>
          ) : (
            <>
              <p className="text-sm">Нет закрытых задач по серверу «{serverMeta(serverFilter).label}»</p>
              <button
                onClick={() => setServerFilter('all')}
                className="mt-3 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:text-foreground transition-colors"
              >
                Показать все серверы
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleTasks.map((t) => {
            const ids = taskAssigneeIds(t);
            const namesLabel = ids.length > 0 ? ids.map((id) => resolveAssignee(team, id).name).join(', ') : 'Не назначен';
            const om = outcomeMeta(t.outcome ?? 'done');
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors group"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0"
                  style={{ background: `hsl(${om.color} / 0.15)`, color: `hsl(${om.color})` }}
                >
                  <Icon name={om.icon} size={12} />
                  {om.label}
                </span>
                <button onClick={() => onCardClick(t)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{categoryMeta(t.category).label} · {namesLabel}</div>
                  {/* Кто и когда закрыл задачу — видно прямо в списке архива, без открытия карточки */}
                  {t.closedBy != null && (
                    <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                      Закрыл: {resolveAssignee(team, t.closedBy).name}
                      {t.archivedAt ? ` · ${formatMskDateTime(t.archivedAt)}` : ''}
                    </div>
                  )}
                </button>
                {/* Серверы задачи — без них сортировка «по серверам» была бы непонятной */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {taskServerIds(t).map((sid) => <ServerBadge key={sid} id={sid} />)}
                </div>
                <AssigneeStack ids={ids} team={team} size={26} />
                {isAdmin && (confirmId === t.id ? (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="hidden sm:inline text-xs text-muted-foreground">Удалить навсегда?</span>
                    <button
                      onClick={() => { setConfirmId(null); onDelete(t.id); }}
                      className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onRestore(t.id)}
                      title="Вернуть на доску"
                      className="shrink-0 h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="ArchiveRestore" size={13} />
                      <span className="hidden sm:inline">Вернуть</span>
                    </button>
                    <button
                      onClick={() => setConfirmId(t.id)}
                      title="Удалить навсегда"
                      className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}