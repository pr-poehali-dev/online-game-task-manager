import Icon from '@/components/ui/icon';
import AddStreamerForm from './AddStreamerForm';
import StreamerCard from './StreamerCard';
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
  const { streamers, health, defaultRule, loading, error, add, update, remove } = useStreamers(active);
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
          <span>Ищем в названии трансляции: <span className="text-foreground font-medium">{keywords}</span></span>
        </div>
      )}
      {!keywords && <div className="mb-4" />}

      {canEdit && <AddStreamerForm onAdd={add} />}

      {loading ? (
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
