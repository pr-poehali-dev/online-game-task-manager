import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import { useCatalog } from '@/lib/catalog';
import {
  taskAssigneeIds,
  hueFor,
  initials,
} from './shared';
import type {
  TeamMember,
  Task,
  CategoryId,
  ViewId,
} from './shared';

export interface SidebarContentProps {
  view: ViewId;
  category: CategoryId | 'all';
  setCategory: (c: CategoryId | 'all') => void;
  kbArticles: KbArticleBrief[];
  tasks: Task[];
  team: TeamMember[];
  assigneeFilter: number | 'all';
  setAssigneeFilter: (a: number | 'all') => void;
  setView: (v: ViewId) => void;
  showLogo?: boolean;
}

export function SidebarContent({
  view,
  category,
  setCategory,
  kbArticles,
  tasks,
  team,
  assigneeFilter,
  setAssigneeFilter,
  setView,
  showLogo = true,
}: SidebarContentProps) {
  const { categories } = useCatalog();
  return (
    <>
      {/* Logo — L2 style */}
      {showLogo && (
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <button onClick={() => setView('board')} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
            {/* Знак: градиент + светлая грань сверху внутри + тёплое свечение наружу. Плоский
                градиентный квадрат без этих двух слоёв читается как заглушка. */}
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-accent"
              style={{ background: 'linear-gradient(135deg, hsl(35 85% 42%), hsl(45 92% 58%))' }}>
              <Icon name="Swords" size={20} className="text-black/80" />
            </div>
            <div>
              <div className="font-display text-xl leading-none tracking-widest text-foreground" style={{ letterSpacing: '0.18em' }}>ЭРА</div>
              <div className="text-xs text-muted-foreground mt-0.5 tracking-wide">Рабочее пространство</div>
            </div>
          </button>
        </div>
      )}

      {/* Categories nav */}
      <div className="px-4 pt-4 pb-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 mb-2.5 px-1">Категории</div>
        <div className="space-y-0.5">
          <button
            onClick={() => setCategory('all')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm surface-interactive ${category === 'all' ? 'bg-primary/15 text-primary font-medium shadow-[inset_0_1px_0_0_hsl(45_100%_80%/0.08)]' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon name="LayoutGrid" size={16} />
            {view === 'knowledge' ? 'Все статьи' : 'Все задачи'}
            <span className="ml-auto text-xs num opacity-60">{view === 'knowledge' ? kbArticles.length : tasks.length}</span>
          </button>
          {categories.map((cat) => {
            const count = view === 'knowledge'
              ? kbArticles.filter((a) => a.category === cat.id).length
              : tasks.filter((t) => t.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm surface-interactive"
                style={{
                  background: category === cat.id ? `hsl(${cat.color} / 0.12)` : 'transparent',
                  color: category === cat.id ? `hsl(${cat.color})` : 'hsl(var(--muted-foreground))',
                  fontWeight: category === cat.id ? 500 : 400,
                }}
              >
                <Icon name={cat.icon} size={16} />
                {cat.label}
                <span className="ml-auto text-xs num opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 shrink-0 border-t border-border">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 mb-2.5 px-1 flex items-center gap-1.5">
          Команда
          <span className="text-[11px] num opacity-60">
            {team.filter((m) => m.online).length}/{team.length} онлайн
          </span>
        </div>
        <div className="space-y-0.5">
          {team.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-1.5">Пока никого нет</div>
          )}
          {team.map((m) => {
            const hue = hueFor(m.tg_username || m.first_name || String(m.id));
            const displayName = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
            const tg = (m.tg_username || '').replace('@', '');
            const openTasks = tasks.filter((t) => !t.archived && t.column !== 'done' && taskAssigneeIds(t).includes(m.id)).length;
            const filterActive = assigneeFilter === m.id;
            return (
              <div
                key={m.id}
                onClick={() => { setAssigneeFilter(filterActive ? 'all' : m.id); setView('board'); }}
                title={filterActive ? 'Показать все задачи' : `Показать задачи: ${displayName}`}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg surface-interactive group cursor-pointer ${filterActive ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
              >
                <div className="relative shrink-0">
                  {m.photo_url ? (
                    <img src={m.photo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                  ) : (
                    <div
                      className="h-7 w-7 rounded-md flex items-center justify-center text-xs font-semibold"
                      style={{ background: `hsl(${hue} / 0.18)`, color: `hsl(${hue})` }}
                    >
                      {initials(m.first_name, m.last_name)}
                    </div>
                  )}
                  <span
                    title={m.pending ? 'Ожидает входа' : m.online ? 'Онлайн' : 'Оффлайн'}
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${m.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{displayName}</div>
                  {/* 11px с лёгким трекингом вместо 10px впритык: мелкий текст должен «дышать»,
                      иначе строка выглядит сжатой и дешёвой. */}
                  <div className="text-[11px] tracking-[0.01em] text-muted-foreground/80 truncate">
                    {m.specialization || (m.role === 'admin' ? 'Администратор' : 'Участник')}
                  </div>
                </div>
                {openTasks > 0 && (
                  <span
                    title={`Открытых задач: ${openTasks}`}
                    className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[11px] num font-semibold flex items-center justify-center group-hover:opacity-0 transition-opacity"
                  >
                    {openTasks}
                  </span>
                )}
                {tg && (
                  <a
                    href={`https://t.me/${tg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Написать ${displayName} в Telegram`}
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                  >
                    <Icon name="Send" size={12} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function IndexSidebar(props: SidebarContentProps) {
  // В разделе AI боковая колонка не нужна: категории задач и список команды к диалогам с
  // моделями отношения не имеют, а у самого раздела есть собственная колонка со списком чатов.
  // Скрываем её целиком, чтобы освободить место переписке (у AI своя навигация внутри).
  if (props.view === 'ai') return null;
  return (
    <aside className="w-72 shrink-0 border-r border-border/60 bg-card/40 backdrop-blur-xl hidden lg:flex flex-col">
      <SidebarContent {...props} />
    </aside>
  );
}