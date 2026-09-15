import type { ReactNode } from 'react';
import Icon from '@/components/ui/icon';
import { useCatalog } from '@/lib/catalog';
import { priorityMap } from './sharedConstants';
import { formatDeadline, deadlineState, resolveAssignee } from './sharedHelpers';
import type { Priority, DeployStatus, CategoryId, ServerId, DeadlineState, AssigneeView, TeamMember } from './sharedTypes';

export function PriorityBadge({ p }: { p: Priority }) {
  const meta = priorityMap[p];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md border"
      style={{
        // Заливка почти прозрачная, цвет держат точка и тонкая рамка — плашка перестаёт
        // «светиться» пятном на карточке, но приоритет по-прежнему считывается мгновенно.
        background: `hsl(${meta.color} / 0.07)`,
        borderColor: `hsl(${meta.color} / 0.22)`,
        color: `hsl(${meta.color})`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: `hsl(${meta.color})` }} />
      {meta.label}
    </span>
  );
}

export function DeployBadge({ status }: { status: DeployStatus }) {
  // Статусы деплоя — редактируемый справочник (см. useCatalog и db_migrations V0095), поэтому
  // подпись/цвет/иконка берутся из него, а не из захардкоженного списка.
  const { deployStatusMeta } = useCatalog();
  const ds = deployStatusMeta(status);
  if (status === 'none') return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
      style={{
        background: `hsl(${ds.color} / 0.12)`,
        color: `hsl(${ds.color})`,
        borderColor: `hsl(${ds.color} / 0.3)`,
      }}
    >
      <Icon name={ds.icon} size={10} />
      {ds.label}
    </span>
  );
}

export function LauncherBadge({ uploaded }: { uploaded: boolean }) {
  if (uploaded) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
        style={{ background: 'hsl(152 55% 50% / 0.12)', color: 'hsl(152 55% 50%)', borderColor: 'hsl(152 55% 50% / 0.3)' }}
      >
        <Icon name="CheckCircle2" size={10} />
        Загружено в лаунчер
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md border animate-pulse"
      style={{ background: 'hsl(0 75% 55% / 0.15)', color: 'hsl(0 75% 60%)', borderColor: 'hsl(0 75% 55% / 0.4)' }}
    >
      <Icon name="UploadCloud" size={10} />
      Требует заливки в лаунчер
    </span>
  );
}

export function CategoryBadge({ id }: { id: CategoryId }) {
  const { categoryMeta } = useCatalog();
  const c = categoryMeta(id);
  // Категория — справочная подпись, а не акцент: раньше цветная заливка спорила с приоритетом и
  // статусом на той же карточке. Теперь цвет остаётся только в иконке, сам текст приглушён.
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon name={c.icon} size={10} style={{ color: `hsl(${c.color} / 0.75)` }} />
      {c.label}
    </span>
  );
}

export function AssigneeAvatar({ a, size = 24 }: { a: AssigneeView; size?: number }) {
  if (a.photo_url) {
    return <img src={a.photo_url} alt={a.name} title={a.name} className="rounded-md object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
      style={{ width: size, height: size, background: `hsl(${a.color} / 0.18)`, color: `hsl(${a.color})` }}
      title={a.name}
    >
      {a.short}
    </div>
  );
}

export function AssigneeStack({ ids, team, size = 24, max = 3 }: { ids: number[]; team: TeamMember[]; size?: number; max?: number }) {
  if (ids.length === 0) {
    return <AssigneeAvatar a={resolveAssignee(team, null)} size={size} />;
  }
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <div className="flex items-center shrink-0" title={ids.map((id) => resolveAssignee(team, id).name).join(', ')}>
      <div className="flex -space-x-2">
        {shown.map((id) => (
          <div key={id} className="ring-2 ring-card rounded-md">
            <AssigneeAvatar a={resolveAssignee(team, id)} size={size} />
          </div>
        ))}
      </div>
      {rest > 0 && (
        <span
          className="ml-1 rounded-md flex items-center justify-center text-[10px] font-semibold bg-secondary text-muted-foreground"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function DeadlineBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const state = deadlineState(iso);
  const colors: Record<DeadlineState, string> = {
    overdue: '0 65% 60%',
    soon: '35 90% 60%',
    normal: '215 15% 55%',
  };
  const color = colors[state];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0"
      style={{ background: `hsl(${color} / 0.12)`, color: `hsl(${color})` }}
      title={state === 'overdue' ? 'Срок истёк' : 'Дедлайн'}
    >
      <Icon name={state === 'overdue' ? 'AlarmClockOff' : 'AlarmClock'} size={11} />
      {formatDeadline(iso)}
    </span>
  );
}

export function ServerBadge({ id }: { id: ServerId }) {
  const { serverMeta } = useCatalog();
  const s = serverMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md shrink-0 border"
      style={{
        // Та же логика, что у приоритета: цвет сервера держат точка и тонкая рамка, а не заливка.
        background: `hsl(${s.color} / 0.07)`,
        borderColor: `hsl(${s.color} / 0.22)`,
        color: `hsl(${s.color})`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: `hsl(${s.color})` }} />
      {s.label}
    </span>
  );
}

export function ModalOverlay({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      // Подложка: глубже и с более заметным размытием — модальное окно должно читаться как
      // отдельный слой, а не как панель, приклеенная поверх страницы.
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto animate-fade-in"
      style={{ background: 'hsl(222 30% 2% / 0.72)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        // Та же логика глубины, что у карточек доски: светлая грань сверху внутри + глубокая
        // мягкая тень наружу. Граница приглушена — край задаёт тень, а не жёсткая линия.
        className={`w-full rounded-2xl border border-border/70 bg-card animate-scale-in mb-8 shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.05),0_32px_72px_-20px_hsl(222_30%_2%/0.7)] ${wide ? 'max-w-3xl xl:max-w-5xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Select({ label, value, onChange, options, compact, invalid }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
  // invalid — поле обязательное и пока не заполнено: подсвечиваем рамку, чтобы было понятно,
  // почему кнопка сохранения недоступна.
  invalid?: boolean;
}) {
  return (
    <div>
      <label className={`block text-muted-foreground ${compact ? 'text-[11px] tracking-[0.01em] mb-1' : 'text-xs mb-1.5'}`}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg bg-secondary/50 text-foreground transition-all duration-200 ease-premium hover:bg-secondary/70 focus:outline-none focus:bg-secondary/70 ${invalid ? 'border border-destructive focus:border-destructive' : 'border border-border focus:border-primary/50'} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Поле ввода. Фокус — мягкая подсветка рамки и свечение того же цвета (см. :focus-visible в
// index.css), без жёсткого кольца с зазором. Переходы идут по общей премиальной кривой.
export const inputCls = 'w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all duration-200 ease-premium hover:border-border hover:bg-secondary/70 focus:outline-none focus:border-primary/50 focus:bg-secondary/70';