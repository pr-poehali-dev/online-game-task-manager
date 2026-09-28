import Icon from '@/components/ui/icon';
import type { DigestCounts, DigestPrefs } from './useDailyDigest';
import type { ViewId } from './shared';

interface DigestRow {
  key: keyof DigestCounts;
  enabledKey: keyof DigestPrefs;
  icon: string;
  color: string;
  label: string;
  view: ViewId;
}

const ROWS: DigestRow[] = [
  { key: 'patchnotes', enabledKey: 'patchnotesEnabled', icon: 'ScrollText', color: '270 65% 65%', label: 'Новых записей в патчноутах', view: 'patchnotes' },
  { key: 'newTasks', enabledKey: 'newTasksEnabled', icon: 'ClipboardCheck', color: '210 80% 62%', label: 'Новых задач назначено вам', view: 'board' },
  { key: 'closedTasks', enabledKey: 'closedTasksEnabled', icon: 'CircleCheck', color: '152 55% 50%', label: 'Задач закрыто командой', view: 'archive' },
  { key: 'newIdeas', enabledKey: 'newIdeasEnabled', icon: 'Lightbulb', color: '45 90% 55%', label: 'Новых идей', view: 'ideas' },
  { key: 'newArticles', enabledKey: 'newArticlesEnabled', icon: 'BookOpen', color: '35 90% 60%', label: 'Новых статей в базе знаний', view: 'knowledge' },
];

function fmtPeriod(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) => d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `С ${fmt(start)} по ${fmt(end)} (МСК)`;
}

// DailyDigestModal — попап дайджеста дня. НЕ использует общий ModalOverlay (sharedComponents.tsx):
// тот закрывается кликом по подложке и Escape, а этот попап обязан оставаться на экране, пока
// сотрудник сам не нажмёт «Ознакомлен» — специально нет onClose и обработчика клика по фону.
export default function DailyDigestModal({
  counts,
  prefs,
  periodStart,
  periodEnd,
  acknowledging,
  onAcknowledge,
  onMinimize,
  onNavigate,
}: {
  counts: DigestCounts;
  prefs: DigestPrefs | null;
  periodStart: string | null;
  periodEnd: string | null;
  acknowledging: boolean;
  onAcknowledge: () => void;
  // onMinimize — переход по пункту сворачивает попап, НЕ подтверждая дайджест (см. useDailyDigest,
  // minimized) — сотрудник должен нажать «Ознакомлен» осознанно, а не случайно закрыть весь
  // дайджест первым же кликом по ссылке.
  onMinimize: () => void;
  onNavigate: (view: ViewId) => void;
}) {
  const visibleRows = ROWS.filter((r) => prefs?.[r.enabledKey] !== false);
  const total = visibleRows.reduce((sum, r) => sum + (counts[r.key] || 0), 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'hsl(222 30% 2% / 0.85)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/70 bg-card animate-scale-in shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.05),0_32px_72px_-20px_hsl(222_30%_2%/0.7)]"
      >
        <div className="p-6 pb-4 text-center border-b border-border/60">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
            <Icon name="Newspaper" size={22} className="text-primary" />
          </div>
          <h2 className="font-display tracking-wide text-lg">Дайджест дня</h2>
          <p className="text-xs text-muted-foreground mt-1">{fmtPeriod(periodStart, periodEnd)}</p>
        </div>

        <div className="p-5">
          {total === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Icon name="Coffee" size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">За это время новых событий не было</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleRows.map((r) => {
                const value = counts[r.key] || 0;
                return (
                  <button
                    key={r.key}
                    onClick={() => { onMinimize(); onNavigate(r.view); }}
                    disabled={value === 0}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${
                      value > 0 ? 'hover:bg-secondary/60 cursor-pointer' : 'opacity-50 cursor-default'
                    }`}
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `hsl(${r.color} / 0.15)`, color: `hsl(${r.color})` }}
                    >
                      <Icon name={r.icon} size={16} />
                    </div>
                    <span className="flex-1 text-sm">{r.label}</span>
                    <span className="text-lg font-semibold tabular-nums" style={{ color: value > 0 ? `hsl(${r.color})` : undefined }}>
                      {value}
                    </span>
                    {value > 0 && <Icon name="ChevronRight" size={15} className="text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 pt-0">
          <button
            onClick={onAcknowledge}
            disabled={acknowledging}
            className="w-full h-11 rounded-xl bg-gradient-to-b from-[hsl(38_90%_60%)] to-[hsl(38_85%_50%)] text-primary-foreground text-sm font-semibold shadow-accent hover:shadow-accent-hover hover:brightness-[1.06] active:translate-y-px transition-all duration-200 ease-premium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {acknowledging ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
            Ознакомлен
          </button>
        </div>
      </div>
    </div>
  );
}