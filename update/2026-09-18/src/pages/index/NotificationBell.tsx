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

// "Личные" типы — упоминание и прямой ответ на комментарий пользователя (см. MENTION_TYPES в
// backend/notifications). Ради них появилась вкладка «Упоминания»: в общей ленте среди статусов
// деплоя/лаунчера эти уведомления сложно найти глазами — так пользователь может мгновенно
// отфильтровать только то, что требует его личной реакции.
const MENTION_TYPES = new Set(['task_mention', 'idea_mention', 'task_reply', 'idea_reply']);
type Tab = 'all' | 'mentions';

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
  launcher_required:  { icon: 'UploadCloud', color: '0 75% 60%' },
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
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [mentionsUnread, setMentionsUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (filter: Tab) => {
    try {
      const url = filter === 'mentions' ? `${NOTIFICATIONS_URL}?filter=mentions` : NOTIFICATIONS_URL;
      const res = await fetch(url, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
        setMentionsUnread(data.mentionsUnread || 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load(tab);
    // Оба счётчика (unread — общий, mentionsUnread — только по упоминаниям/ответам) backend
    // отдаёт при любом filter, так что переключение вкладки не мешает фоновому обновлению бейджей.
    const t = setInterval(() => load(tab), 20000);
    return () => clearInterval(t);
  }, [load, tab]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function markRead(id: string) {
    const n = items.find((x) => x.id === id);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, isRead: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    if (n && MENTION_TYPES.has(n.type)) setMentionsUnread((u) => Math.max(0, u - 1));
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
    // На вкладке «Упоминания» отмечает прочитанными только их — на «Все» ведёт себя как раньше.
    // Backend поддерживает только полный mark_all, поэтому на вкладке "Упоминания" читаем каждую
    // видимую запись по отдельности (их не может быть больше 50 — тот же LIMIT, что и у списка).
    if (tab === 'mentions') {
      const ids = items.filter((n) => !n.isRead).map((n) => n.id);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread((u) => Math.max(0, u - ids.length));
      setMentionsUnread(0);
      try {
        await Promise.all(ids.map((id) => fetch(NOTIFICATIONS_URL, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'mark_read', id }),
        })));
      } catch {
        /* ignore */
      }
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    setMentionsUnread(0);
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
    setMentionsUnread(0);
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
        {/* Отдельный маленький @ индикатор — виден даже когда общий бейдж перегружен статусами
            деплоя/лаунчера, сразу сигналит "тебя лично упомянули", без открытия панели. */}
        {mentionsUnread > 0 && (
          <span className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-semibold flex items-center justify-center">
            @{mentionsUnread > 99 ? '99+' : mentionsUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[60] w-80 rounded-xl border border-border bg-card shadow-xl animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Уведомления</span>
            <div className="flex items-center gap-3">
              {(tab === 'mentions' ? mentionsUnread : unread) > 0 && (
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
          <div className="flex border-b border-border px-2 pt-1 gap-1">
            {(['all', 'mentions'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors ${
                  tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'all' ? 'Все' : 'Упоминания'}
                {t === 'mentions' && mentionsUnread > 0 && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-semibold flex items-center justify-center">
                    {mentionsUnread > 99 ? '99+' : mentionsUnread}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="max-h-96 overflow-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Icon name="BellOff" size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">{tab === 'mentions' ? 'Упоминаний пока нет' : 'Уведомлений пока нет'}</p>
              </div>
            ) : (
              items.map((n) => {
                const m = metaFor(n.type);
                const clickable = !!n.entityType && !!n.entityId;
                const isMention = MENTION_TYPES.has(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    disabled={!clickable}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-border/60 last:border-0 transition-colors ${clickable ? 'hover:bg-secondary/50 cursor-pointer' : 'cursor-default'} ${
                      isMention ? 'border-l-2 border-l-amber-500' : ''
                    } ${n.isRead ? '' : isMention ? 'bg-amber-500/10' : 'bg-primary/5'}`}
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