import { useState } from 'react';
import Icon from '@/components/ui/icon';
import AddStreamerForm from './AddStreamerForm';
import StreamerCard from './StreamerCard';
import StreamSessions from './StreamSessions';
import StreamerRulesTab from './StreamerRulesTab';
import { useStreamers } from './useStreamers';
import type { CollectorHealth } from './streamersTypes';

interface Props {
  active: boolean;
  canEdit: boolean;
}

function healthText(h: CollectorHealth | null): { text: string; ok: boolean } {
  if (!h || h.secondsSinceSuccess == null) {
    return { text: 'Сборщик ещё ни разу не запускался. Нужно настроить расписание запуска раз в минуту', ok: false };
  }
  const s = h.secondsSinceSuccess;
  const ago = s < 90 ? `${s} сек назад` : s < 5400 ? `${Math.round(s / 60)} мин назад` : `${Math.round(s / 3600)} ч назад`;
  if (!h.healthy) return { text: `Последняя проверка была ${ago}. Похоже, сборщик остановился`, ok: false };
  return { text: `Последняя проверка Kick: ${ago}`, ok: true };
}

export default function Streamers({ active, canEdit }: Props) {
  const [tab, setTab] = useState<'list' | 'history' | 'rules'>('list');
  const { streamers, health, defaultRule, loading, error, reload, add, update, remove } = useStreamers(active);
  const liveCount = streamers.filter((s) => s.live).length;
  const status = healthText(health);
  const keywords = defaultRule?.keywords?.length ? defaultRule.keywords.join(', ') : null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <div className="text-lg font-semibold">Стримеры</div>
        <span className="text-sm text-muted-foreground">
          В эфире сейчас: <span className="text-foreground font-medium">{liveCount}</span> из {streamers.length}
        </span>
      </div>

      <div className={`flex items-start gap-2 text-xs mb-1 ${status.ok ? 'text-muted-foreground' : 'text-amber-500'}`}>
        <Icon name={status.ok ? 'Activity' : 'AlertTriangle'} size={13} className="mt-0.5 shrink-0" />
        <span>{status.text}</span>
      </div>
      {keywords && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground mb-4">
          <Icon name="Search" size={13} className="mt-0.5 shrink-0" />
          <span>Общее правило, ищем в названии: <span className="text-foreground font-medium">{keywords}</span>{defaultRule?.matchMode === 'all' ? ' (нужны все слова)' : ''}</span>
        </div>
      )}
      {!keywords && <div className="mb-4" />}

      <div className="flex gap-1 bg-secondary/40 p-1 rounded-lg border border-border/40 w-fit mb-4">
        {([['list', 'Список', 'Users'], ['history', 'История эфиров', 'History'], ['rules', 'Правила', 'SlidersHorizontal']] as const).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' && <StreamSessions active={active && tab === 'history'} streamers={streamers} />}

      {tab === 'rules' && <StreamerRulesTab active={active && tab === 'rules'} canEdit={canEdit} streamers={streamers} onChanged={reload} />}

      {tab === 'list' && canEdit && <AddStreamerForm onAdd={add} />}

      {tab !== 'list' ? null : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Icon name="Loader2" size={16} className="animate-spin" />
          Загрузка…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive flex items-center gap-2">
          <Icon name="AlertCircle" size={15} />
          {error}
        </div>
      ) : streamers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {canEdit ? 'Стримеров пока нет. Вставьте ссылку на канал Kick выше, и мониторинг начнётся автоматически.' : 'Стримеров пока нет.'}
        </div>
      ) : (
        <div className="space-y-3">
          {streamers.map((s) => (
            <StreamerCard key={s.id} streamer={s} canEdit={canEdit} onUpdate={update} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}