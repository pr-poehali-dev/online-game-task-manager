import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import {
  taskAssigneeIds,
  categories,
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
  return (
    <>
      {/* Logo — L2 style */}
      {showLogo && (
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <button onClick={() => setView('board')} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(35 85% 40%), hsl(45 90% 55%))' }}>
              <Icon name="Swords" size={20} className="text-black/80" />
            </div>
            <div>
              <div className="font-display text-xl leading-none tracking-widest text-foreground" style={{ letterSpacing: '0.18em' }}>ЭРА</div>
              <div className="text-xs text-muted-foreground mt-0.5 tracking-wide">Task Command</div>
            </div>
          </button>
        </div>
      )}

      {/* Categories nav */}
      <div className="px-4 pt-4 pb-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-1">Категории</div>
        <div className="space-y-0.5">
          <button
            onClick={() => setCategory('all')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${category === 'all' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
          >
            <Icon name="LayoutGrid" size={14} />
            {view === 'knowledge' ? 'Все статьи' : 'Все задачи'}
            <span className="ml-auto text-xs font-mono opacity-60">{view === 'knowledge' ? kbArticles.length : tasks.length}</span>
          </button>
          {categories.map((cat) => {
            const count = view === 'knowledge'
              ? kbArticles.filter((a) => a.category === cat.id).length
              : tasks.filter((t) => t.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  background: category === cat.id ? `hsl(${cat.color} / 0.12)` : 'transparent',
                  color: category === cat.id ? `hsl(${cat.color})` : 'hsl(var(--muted-foreground))',
                  fontWeight: category === cat.id ? 500 : 400,
                }}
              >
                <Icon name={cat.icon} size={14} />
                {cat.label}
                <span className="ml-auto text-xs font-mono opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 shrink-0 border-t border-border">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
          Команда
          <span className="text-[10px] font-mono opacity-60">
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
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors group cursor-pointer ${filterActive ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/50'}`}
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
                  <div className="text-xs text-muted-foreground truncate" style={{ fontSize: '10px' }}>
                    {m.specialization || (m.role === 'admin' ? 'Администратор' : 'Участник')}
                  </div>
                </div>
                {openTasks > 0 && (
                  <span
                    title={`Открытых задач: ${openTasks}`}
                    className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center group-hover:opacity-0 transition-opacity"
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
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/60 backdrop-blur-sm hidden lg:flex flex-col">
      <SidebarContent {...props} />
    </aside>
  );
}