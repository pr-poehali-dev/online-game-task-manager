import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import type { AuthUser, PermissionKey } from '@/lib/auth';
import NotificationBell from './NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarContent } from './IndexSidebar';
import {
  resolveAssignee,
  categoryMeta,
  servers,
} from './shared';
import type {
  TeamMember,
  Task,
  Sprint,
  ServerId,
  CategoryId,
  ColumnId,
  ViewId,
} from './shared';
import type { KbArticleBrief } from '@/components/KnowledgeBase';

export default function IndexTopbar({
  view,
  setView,
  category,
  setCategory,
  user,
  isAdmin,
  can,
  onOpenTaskById,
  onOpenIdeaById,
  setCreateSprint,
  setCreateFor,
  server,
  setServer,
  assigneeFilter,
  setAssigneeFilter,
  myOpenCount,
  sprints,
  sprintFilter,
  setSprintFilter,
  activeTasks,
  team,
  kbArticles,
}: {
  view: ViewId;
  setView: (v: ViewId) => void;
  category: CategoryId | 'all';
  setCategory: (c: CategoryId | 'all') => void;
  user: AuthUser | null;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  onOpenTaskById: (taskId: string) => void;
  onOpenIdeaById: (ideaId: string) => void;
  setCreateSprint: (v: boolean) => void;
  setCreateFor: (v: ColumnId | null) => void;
  server: ServerId | 'all';
  setServer: (s: ServerId | 'all') => void;
  assigneeFilter: number | 'all';
  setAssigneeFilter: (a: number | 'all') => void;
  myOpenCount: number;
  sprints: Sprint[];
  sprintFilter: string | 'all';
  setSprintFilter: (s: string | 'all') => void;
  activeTasks: Task[];
  team: TeamMember[];
  kbArticles: KbArticleBrief[];
}) {
  const navigate = useNavigate();
  const restartCount = activeTasks.filter((t) => t.column === 'restart').length;
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV_ITEMS = [
    { k: 'board', label: 'Доска', icon: 'LayoutGrid' },
    { k: 'restart', label: 'К рестарту', icon: 'RotateCcw' },
    { k: 'sprints', label: 'Спринты', icon: 'Zap' },
    { k: 'ideas', label: 'Идеи', icon: 'Lightbulb' },
    { k: 'knowledge', label: 'База знаний', icon: 'BookOpen' },
    { k: 'patchnotes', label: 'Патчноуты', icon: 'ScrollText' },
    { k: 'archive', label: 'Архив', icon: 'Archive' },
  ] as const;

  return (
    <>
      {/* Topbar */}
      <header className="relative z-30 h-14 border-b border-border flex items-center gap-2 sm:gap-4 px-3 sm:px-6 bg-card/40 backdrop-blur-sm"
        style={{ borderBottom: '1px solid hsl(var(--border))', boxShadow: '0 1px 0 hsl(35 85% 45% / 0.08)' }}>
        <button
          onClick={() => setMenuOpen(true)}
          className="lg:hidden h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Icon name="Menu" size={18} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display tracking-widest text-base hidden sm:inline shrink-0" style={{ letterSpacing: '0.12em', color: 'hsl(35 85% 60%)' }}>ЭРА</span>
          <span className="text-muted-foreground/40 text-sm hidden sm:inline">/</span>
          <span className="text-sm text-muted-foreground truncate">
            {view === 'board' && 'Доска задач'}
            {view === 'sprints' && 'Спринты'}
            {view === 'archive' && 'Архив задач'}
            {view === 'knowledge' && 'База знаний'}
            {view === 'restart' && 'К рестарту'}
            {view === 'ideas' && 'Идеи'}
            {view === 'patchnotes' && 'Патчноуты'}
          </span>
        </div>
        <nav className="ml-4 hidden md:flex gap-1 bg-secondary/60 p-1 rounded-lg">
          {NAV_ITEMS.map((t) => (
            <button
              key={t.k}
              onClick={() => setView(t.k as typeof view)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === t.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
              {t.k === 'restart' && restartCount > 0 && (
                <span
                  className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                    view === 'restart' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/15 text-primary'
                  }`}
                >
                  {restartCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {category !== 'all' && (
            <button
              onClick={() => setCategory('all')}
              className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
              style={{
                borderColor: `hsl(${categoryMeta(category as CategoryId).color} / 0.4)`,
                background: `hsl(${categoryMeta(category as CategoryId).color} / 0.1)`,
                color: `hsl(${categoryMeta(category as CategoryId).color})`,
              }}
            >
              <Icon name={categoryMeta(category as CategoryId).icon} size={12} />
              {categoryMeta(category as CategoryId).label}
              <Icon name="X" size={11} />
            </button>
          )}
          <ThemeToggle />
          {user && (
            <NotificationBell
              onOpenTask={onOpenTaskById}
              onOpenIdea={onOpenIdeaById}
            />
          )}
          {user ? (
            <button
              onClick={() => navigate(isAdmin ? '/admin' : '/cabinet')}
              title={isAdmin ? 'Админка' : 'Личный кабинет'}
              className="h-8 px-2.5 rounded-lg bg-secondary/60 flex items-center gap-2 hover:bg-secondary transition-colors"
            >
              {user.photo_url ? (
                <img src={user.photo_url} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <Icon name={isAdmin ? 'Shield' : 'User'} size={15} />
              )}
              <span className="hidden sm:inline text-sm">{user.first_name}</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="h-8 px-3 rounded-lg bg-secondary/60 flex items-center gap-2 hover:bg-secondary transition-colors text-sm"
            >
              <Icon name="LogIn" size={15} />
              <span className="hidden sm:inline">Войти</span>
            </button>
          )}
          {view === 'sprints' && can('sprint_create') && (
            <button
              onClick={() => setCreateSprint(true)}
              className="flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Icon name="Plus" size={15} />
              <span className="hidden sm:inline">Спринт</span>
            </button>
          )}
          {view === 'board' && can('task_create') && (
            <button
              onClick={() => setCreateFor('todo')}
              className="flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Icon name="Plus" size={15} />
              <span className="hidden sm:inline">Задача</span>
            </button>
          )}
        </div>
      </header>

      {/* Filter bar — server + sprint */}
      {view === 'board' && (
        <div className="flex items-center gap-2 px-3 sm:px-6 py-2.5 border-b border-border bg-card/10 overflow-x-auto scrollbar-thin">
          <Icon name="Server" size={12} className="text-muted-foreground shrink-0" />
          <button
            onClick={() => setServer('all')}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 ${
              server === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            Все серверы
          </button>
          {servers.map((s) => {
            const active = server === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setServer(s.id)}
                className="text-xs font-medium px-2.5 py-1 rounded-md transition-all shrink-0 flex items-center gap-1.5 border"
                style={{
                  background: active ? `hsl(${s.color} / 0.18)` : 'transparent',
                  borderColor: active ? `hsl(${s.color} / 0.4)` : 'hsl(var(--border))',
                  color: active ? `hsl(${s.color})` : 'hsl(var(--muted-foreground))',
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${s.color})` }} />
                {s.label}
              </button>
            );
          })}
          {view === 'board' && (
            <>
              {user && (
                <>
                  <div className="w-px h-4 bg-border mx-1 shrink-0" />
                  <button
                    onClick={() => setAssigneeFilter(assigneeFilter === user.id ? 'all' : user.id)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1.5 ${
                      assigneeFilter === user.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <Icon name="UserCheck" size={12} />
                    Мои задачи
                    {myOpenCount > 0 && (
                      <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                        assigneeFilter === user.id ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-primary/20 text-primary'
                      }`}>
                        {myOpenCount}
                      </span>
                    )}
                  </button>
                </>
              )}
              <div className="w-px h-4 bg-border mx-1 shrink-0" />
              <Icon name="Zap" size={12} className="text-muted-foreground shrink-0" />
              {sprints.filter((s) => s.status !== 'done').map((sp) => {
                const active = sprintFilter === sp.id;
                const count = activeTasks.filter((t) => t.sprintId === sp.id).length;
                const statusColor = sp.status === 'active' ? '152 55% 50%' : sp.status === 'planned' ? '210 80% 62%' : '215 15% 50%';
                return (
                  <button
                    key={sp.id}
                    onClick={() => setSprintFilter(active ? 'all' : sp.id)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md transition-all shrink-0 flex items-center gap-1.5 border"
                    style={{
                      background: active ? `hsl(${statusColor} / 0.18)` : 'transparent',
                      borderColor: active ? `hsl(${statusColor} / 0.4)` : 'hsl(var(--border))',
                      color: active ? `hsl(${statusColor})` : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {sp.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                    {sp.title}
                    <span
                      className="min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                      style={{ background: active ? `hsl(${statusColor} / 0.25)` : 'hsl(var(--secondary))', color: active ? `hsl(${statusColor})` : 'hsl(var(--muted-foreground))' }}
                    >
                      {count}
                    </span>
                    {active && <Icon name="X" size={11} />}
                  </button>
                );
              })}
              {assigneeFilter !== 'all' && (
                <>
                  <div className="w-px h-4 bg-border mx-1 shrink-0" />
                  <button
                    onClick={() => setAssigneeFilter('all')}
                    title="Сбросить фильтр по исполнителю"
                    className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/40"
                  >
                    <Icon name="User" size={11} />
                    {resolveAssignee(team, assigneeFilter).name}
                    <Icon name="X" size={11} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Мобильное меню — категории, разделы и команда */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 w-80 flex flex-col">
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, hsl(35 85% 40%), hsl(45 90% 55%))' }}>
                <Icon name="Swords" size={20} className="text-black/80" />
              </div>
              <div>
                <div className="font-display text-xl leading-none tracking-widest text-foreground" style={{ letterSpacing: '0.18em' }}>ЭРА</div>
                <div className="text-xs text-muted-foreground mt-0.5 tracking-wide">Task Command</div>
              </div>
            </div>
          </div>

          <div className="px-4 pt-4 pb-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-1">Разделы</div>
            <div className="space-y-0.5">
              {NAV_ITEMS.map((t) => (
                <button
                  key={t.k}
                  onClick={() => { setView(t.k as typeof view); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                    view === t.k ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <Icon name={t.icon} size={15} />
                  {t.label}
                  {t.k === 'restart' && restartCount > 0 && (
                    <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                      {restartCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
            <SidebarContent
              view={view}
              category={category}
              setCategory={(c) => { setCategory(c); setMenuOpen(false); }}
              kbArticles={kbArticles}
              tasks={activeTasks}
              team={team}
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={(a) => { setAssigneeFilter(a); setMenuOpen(false); }}
              setView={(v) => { setView(v); setMenuOpen(false); }}
              showLogo={false}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}