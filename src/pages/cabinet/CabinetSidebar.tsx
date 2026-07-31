import Icon from '@/components/ui/icon';

export type CabinetSection = 'profile' | 'project' | 'team' | 'activity' | 'storage' | 'stats' | 'faq';

interface NavItem {
  key: CabinetSection;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'profile', label: 'Мой профиль', icon: 'User' },
  { key: 'project', label: 'Управление проектом', icon: 'Settings' },
  { key: 'team', label: 'Команда', icon: 'Users' },
  { key: 'activity', label: 'Журнал', icon: 'History' },
  { key: 'storage', label: 'Хранилище', icon: 'HardDrive' },
  { key: 'stats', label: 'Статистика', icon: 'BarChart3' },
  { key: 'faq', label: 'FAQ', icon: 'HelpCircle' },
];

// Разделы "Команда"/"Журнал"/"Хранилище" — точечное право team_manage (делегируется администратором,
// см. backend/admin/index.py has_team_access) ИЛИ настоящая роль admin. "Управление проектом" пока
// пустышка (наполнение — отдельный этап), тоже доступно только с team_manage/admin — по смыслу это
// тоже административная настройка проекта, не должна быть доступна рядовому участнику.
const TEAM_ONLY_SECTIONS = new Set<CabinetSection>(['project', 'team', 'activity', 'storage']);

export function SidebarContent({
  active,
  onSelect,
  hasTeamAccess,
  accessChecked,
  onBoard,
}: {
  active: CabinetSection;
  onSelect: (s: CabinetSection) => void;
  hasTeamAccess: boolean;
  accessChecked: boolean;
  onBoard: () => void;
}) {
  return (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <button onClick={onBoard} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(35 85% 40%), hsl(45 90% 55%))' }}>
            <Icon name="Swords" size={20} className="text-black/80" />
          </div>
          <div>
            <div className="font-display text-xl leading-none tracking-widest text-foreground" style={{ letterSpacing: '0.18em' }}>ЭРА</div>
            <div className="text-xs text-muted-foreground mt-0.5 tracking-wide">Личный кабинет</div>
          </div>
        </button>
      </div>

      <nav className="px-3 py-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isTeamOnly = TEAM_ONLY_SECTIONS.has(item.key);
          // Пока право team_manage/admin ещё не проверено backend (accessChecked === false) —
          // показываем нейтральную заглушку вместо пункта вместо того, чтобы либо скрыть его
          // (а потом резко показать при hasTeamAccess === true), либо показать сразу (а потом
          // резко скрыть при hasTeamAccess === false) — оба варианта визуально "дёргали" сайдбар
          // на долю секунды при каждом заходе в кабинет.
          if (isTeamOnly && !accessChecked) {
            return (
              <div key={item.key} className="h-9 mx-0.5 rounded-lg bg-secondary/40 animate-pulse" />
            );
          }
          if (isTeamOnly && !hasTeamAccess) return null;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active === item.key ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default function CabinetSidebar(props: {
  active: CabinetSection;
  onSelect: (s: CabinetSection) => void;
  hasTeamAccess: boolean;
  accessChecked: boolean;
  onBoard: () => void;
}) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card/60 backdrop-blur-sm hidden lg:flex flex-col">
      <SidebarContent {...props} />
    </aside>
  );
}

export function cabinetSectionLabel(s: CabinetSection): string {
  return NAV_ITEMS.find((i) => i.key === s)?.label ?? '';
}