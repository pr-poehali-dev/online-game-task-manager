import Icon from '@/components/ui/icon';

export default function InviteForm({
  inviteName,
  setInviteName,
  inviteRole,
  setInviteRole,
  inviteSpec,
  setInviteSpec,
  inviting,
  onInvite,
}: {
  inviteName: string;
  setInviteName: (v: string) => void;
  inviteRole: 'member' | 'admin';
  setInviteRole: (v: 'member' | 'admin') => void;
  inviteSpec: string;
  setInviteSpec: (v: string) => void;
  inviting: boolean;
  onInvite: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <label className="block text-xs text-muted-foreground mb-2">Пригласить участника: роль, список задач и Telegram @username</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center sm:w-52 rounded-lg border border-border bg-secondary/60 px-3">
          <span className="text-muted-foreground text-sm">@</span>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onInvite()}
            placeholder="username"
            className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
          />
        </div>
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
          className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm focus:outline-none"
        >
          <option value="member">Участник</option>
          <option value="admin">Администратор</option>
        </select>
        <input
          value={inviteSpec}
          onChange={(e) => setInviteSpec(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onInvite()}
          placeholder="Список задач (напр. Соцсети · Баннеры)"
          className="flex-1 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm focus:outline-none"
        />
        <button
          onClick={onInvite}
          disabled={inviting || !inviteName.trim()}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2 justify-center shrink-0"
        >
          <Icon name="UserPlus" size={15} /> Пригласить
        </button>
      </div>
    </div>
  );
}
