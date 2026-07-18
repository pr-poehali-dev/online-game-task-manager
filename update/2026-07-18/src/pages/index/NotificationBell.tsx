import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { NOTIFICATIONS_URL, authHeaders } from './shared';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actorId: number | null;
  isRead: boolean;
  createdAt: string | null;
}

const typeMeta: Record<string, { icon: string; color: string }> = {
  task_assigned:      { icon: 'ClipboardCheck', color: '210 80% 62%' },
  task_deploy_status: { icon: 'Rocket', color: '270 65% 65%' },
  task_comment:       { icon: 'MessageSquare', color: '152 55% 50%' },
  task_reply:         { icon: 'CornerDownRight', color: '210 80% 62%' },
  task_mention:       { icon: 'AtSign', color: '35 90% 60%' },
  idea_comment:       { icon: 'MessageSquare', color: '152 55% 50%' },
  idea_reply:         { icon: 'CornerDownRight', color: '152 55% 50%' },
  idea_mention:       { icon: 'AtSign', color: '35 90% 60%' },
  idea_status:        { icon: 'Lightbulb', color: '45 90% 55%' },
};

function metaFor(type: string) {
  return typeMeta[type] ?? { icon: 'Bell', color: '215 15% 55%' };
}

function fmtTime(d: string | null) {
  if (!d) return '';
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function NotificationBell({ onOpenTask, onOpenIdea }: {
  onOpenTask: (taskId: string) => void;
  onOpenIdea: (ideaId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(NOTIFICATIONS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch(NOTIFICATIONS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'mark_read', id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await fetch(NOTIFICATIONS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'mark_all' }),
      });
    } catch {
      /* ignore */
    }
  }

  async function clearAll() {
    setItems([]);
    setUnread(0);
    try {
      await fetch(NOTIFICATIONS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'clear_all' }),
      });
    } catch {
      /* ignore */
    }
  }

  function handleClick(n: Notification) {
    if (!n.isRead) markRead(n.id);
    setOpen(false);
    if (n.entityType === 'task' && n.entityId) onOpenTask(n.entityId);
    else if (n.entityType === 'idea' && n.entityId) onOpenIdea(n.entityId);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Уведомления"
        className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors relative"
      >
        <Icon name="Bell" size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[60] w-80 rounded-xl border border-border bg-card shadow-xl animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Уведомления</span>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-primary hover:opacity-80 transition-opacity">
                  Прочитать все
                </button>
              )}
              {items.length > 0 && (
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                  Очистить
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Icon name="BellOff" size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Уведомлений пока нет</p>
              </div>
            ) : (
              items.map((n) => {
                const m = metaFor(n.type);
                const clickable = !!n.entityType && !!n.entityId;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    disabled={!clickable}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-border/60 last:border-0 transition-colors ${clickable ? 'hover:bg-secondary/50 cursor-pointer' : 'cursor-default'} ${n.isRead ? '' : 'bg-primary/5'}`}
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `hsl(${m.color} / 0.15)`, color: `hsl(${m.color})` }}
                    >
                      <Icon name={m.icon} size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{n.title}</span>
                        {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{n.body}</p>}
                      <span className="text-[11px] text-muted-foreground/70">{fmtTime(n.createdAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}