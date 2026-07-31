import Icon from '@/components/ui/icon';
import type { DateRange } from 'react-day-picker';
import ActivityLogList from './ActivityLogList';
import type { ActivityEntry, TeamUser } from './adminShared';

export default function ActivityLogModal({
  onClose,
  loading,
  entries,
  users,
  userFilter,
  setUserFilter,
  range,
  setRange,
}: {
  onClose: () => void;
  loading: boolean;
  entries: ActivityEntry[];
  users: TeamUser[];
  userFilter: number | 'all';
  setUserFilter: (v: number | 'all') => void;
  range: DateRange | undefined;
  setRange: (r: DateRange | undefined) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Журнал действий команды</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Загрузка...' : `${entries.length} записей · хранится 7 дней`}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>

        <ActivityLogList
          loading={loading}
          entries={entries}
          users={users}
          userFilter={userFilter}
          setUserFilter={setUserFilter}
          range={range}
          setRange={setRange}
        />
      </div>
    </div>
  );
}
