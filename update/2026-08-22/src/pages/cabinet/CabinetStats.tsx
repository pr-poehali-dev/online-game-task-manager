import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import type { AuthUser } from '@/lib/auth';
import { authFetch, fmtDuration, fmtDay } from '../admin/adminShared';
import type { TeamUser, UserStats, AiUsageSummaryItem } from '../admin/adminShared';
import { AI_URL, authHeaders } from '../index/shared';

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from, to };
}

function StatCards({ stats, loading }: { stats: UserStats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center py-10"><Icon name="Loader2" size={22} className="animate-spin text-primary" /></div>
    );
  }
  if (!stats) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Не удалось загрузить статистику</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Icon name="PlusCircle" size={13} />
          Создал задач
        </div>
        <div className="text-2xl font-semibold">{stats.createdCount}</div>
      </div>
      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Icon name="CheckCircle2" size={13} />
          Закрыл задач
        </div>
        <div className="text-2xl font-semibold">{stats.closedCount}</div>
      </div>
      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Icon name="Inbox" size={13} />
          Получил задач
        </div>
        <div className="text-2xl font-semibold">{stats.receivedCount}</div>
      </div>
      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Icon name="Clock" size={13} />
          Время в приложении
        </div>
        <div className="text-2xl font-semibold">{fmtDuration(stats.timeSpentSeconds)}</div>
      </div>
    </div>
  );
}

function RangePicker({ range, setRange }: { range: DateRange | undefined; setRange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm hover:bg-secondary transition-colors">
          <Icon name="Calendar" size={15} className="text-muted-foreground" />
          {range?.from
            ? range.to
              ? `${fmtDay(range.from)} — ${fmtDay(range.to)}`
              : fmtDay(range.from)
            : 'Выберите период'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => { setRange(r); if (r?.from && r?.to) setOpen(false); }}
          numberOfMonths={2}
          defaultMonth={range?.from}
        />
      </PopoverContent>
    </Popover>
  );
}

function AiUsageSection({ hasTeamAccess }: { hasTeamAccess: boolean }) {
  const [items, setItems] = useState<AiUsageSummaryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<{ balance: number; budget: number | null } | null>(null);

  useEffect(() => {
    if (!hasTeamAccess) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [summaryRes, balanceRes] = await Promise.all([
        authFetch({ action: 'ai_usage_summary' }),
        fetch(`${AI_URL}?action=balance`, { method: 'GET', headers: authHeaders() }),
      ]);
      if (cancelled) return;
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setItems(data.items || []);
      }
      if (balanceRes.ok) {
        const data = await balanceRes.json().catch(() => null);
        if (data) setBalance({ balance: data.balance, budget: data.budget ?? null });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [hasTeamAccess]);

  if (!hasTeamAccess) return null;

  return (
    <div className="pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold flex items-center gap-1.5">
          <Icon name="Sparkles" size={15} className="text-primary" />
          Траты на AI за этот месяц
        </h2>
        {balance && (
          <span className="text-xs text-muted-foreground">
            Баланс AI Tunnel: <span className="text-foreground font-medium">{balance.balance.toFixed(0)} ₽</span>
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">Расход каждого сотрудника на общение с ИИ-моделями.</p>
      {loading ? (
        <div className="flex justify-center py-8"><Icon name="Loader2" size={20} className="animate-spin text-primary" /></div>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Пока никто не пользовался разделом «AI».</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const pct = it.limitRub > 0 ? Math.min(100, Math.round((it.spentRub / it.limitRub) * 100)) : 0;
            const barColor = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';
            return (
              <div key={it.userId} className="rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium truncate">{it.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {it.spentRub.toFixed(2)} ₽ из {it.limitRub.toFixed(0)} ₽ · {pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CabinetStats({
  user,
  hasTeamAccess,
  users,
  usersLoading,
}: {
  user: AuthUser;
  hasTeamAccess: boolean;
  users: TeamUser[];
  usersLoading: boolean;
}) {
  const [ownRange, setOwnRange] = useState<DateRange | undefined>(defaultRange);
  const [ownStats, setOwnStats] = useState<UserStats | null>(null);
  const [ownLoading, setOwnLoading] = useState(false);

  const loadOwn = useCallback(async (range: DateRange | undefined) => {
    if (!range?.from) return;
    setOwnLoading(true);
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = range.to ? new Date(range.to) : new Date(range.from);
    to.setHours(23, 59, 59, 999);
    const res = await authFetch({ action: 'stats', user_id: user.id, from: from.toISOString(), to: to.toISOString() });
    setOwnStats(res.ok ? await res.json() : null);
    setOwnLoading(false);
  }, [user.id]);

  useEffect(() => { loadOwn(ownRange); }, [loadOwn, ownRange]);

  // Статистика по команде — выбранный участник + его показатели за тот же выбор периода, что и
  // своя статистика выше (упрощение — один общий RangePicker на весь раздел).
  const [teamUserId, setTeamUserId] = useState<number | 'all'>('all');
  const [teamStats, setTeamStats] = useState<UserStats | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  const loadTeam = useCallback(async (uid: number | 'all', range: DateRange | undefined) => {
    if (uid === 'all' || !range?.from) { setTeamStats(null); return; }
    setTeamLoading(true);
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = range.to ? new Date(range.to) : new Date(range.from);
    to.setHours(23, 59, 59, 999);
    const res = await authFetch({ action: 'stats', user_id: uid, from: from.toISOString(), to: to.toISOString() });
    setTeamStats(res.ok ? await res.json() : null);
    setTeamLoading(false);
  }, []);

  useEffect(() => { loadTeam(teamUserId, ownRange); }, [loadTeam, teamUserId, ownRange]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold">Статистика</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Твоя активность за выбранный период.</p>
        <div className="mb-4">
          <RangePicker range={ownRange} setRange={setOwnRange} />
        </div>
        <StatCards stats={ownStats} loading={ownLoading} />
      </div>

      {hasTeamAccess && (
        <div className="pt-6 border-t border-border">
          <h2 className="text-base font-semibold mb-1">Статистика команды</h2>
          <p className="text-sm text-muted-foreground mb-4">Выберите участника, чтобы посмотреть его показатели за тот же период.</p>
          <select
            value={teamUserId}
            onChange={(e) => setTeamUserId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            disabled={usersLoading}
            className="h-9 px-3 rounded-lg border border-border bg-secondary/60 text-sm focus:outline-none mb-4 disabled:opacity-50"
          >
            <option value="all">Выберите участника…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name ?? ''}</option>
            ))}
          </select>
          {teamUserId !== 'all' && <StatCards stats={teamStats} loading={teamLoading} />}
        </div>
      )}

      <AiUsageSection hasTeamAccess={hasTeamAccess} />
    </div>
  );
}