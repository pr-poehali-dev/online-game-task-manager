import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import { IDEAS_URL, authHeaders } from './shared';

type IdeaStatus = 'open' | 'wont_do' | 'sent';

interface Author {
  id: number;
  name: string;
  photo_url: string | null;
}

interface TopicListItem {
  id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  authorId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  commentsCount: number;
}

interface IdeaComment {
  id: string;
  topicId: string;
  authorId: number | null;
  text: string;
  createdAt: string | null;
}

const statusMeta: Record<IdeaStatus, { label: string; color: string; icon: string }> = {
  open:    { label: 'Открыто',                color: '210 80% 62%', icon: 'MessageCircle' },
  wont_do: { label: 'Решено не делать',       color: '0 65% 60%',   icon: 'XCircle' },
  sent:    { label: 'Отправлено на реализацию', color: '152 55% 50%', icon: 'Rocket' },
};

const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initialsFor(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

export default function Ideas({ authors, initialTopicId, onConsumeInitial }: {
  authors: Author[];
  initialTopicId?: string | null;
  onConsumeInitial?: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [list, setList] = useState<TopicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<TopicListItem | null>(null);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newComment, setNewComment] = useState('');

  const authorName = (id: number | null) => (id != null ? authors.find((a) => a.id === id)?.name ?? 'Участник' : 'Участник');
  const authorPhoto = (id: number | null) => (id != null ? authors.find((a) => a.id === id)?.photo_url ?? null : null);
  const canManage = (t: TopicListItem) => !!user && (t.authorId === user.id || isAdmin);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(IDEAS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setList(data.topics || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openTopic = useCallback(async (id: string) => {
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'get', id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.topic) {
          setCurrent(data.topic);
          setComments(data.comments || []);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (initialTopicId) {
      openTopic(initialTopicId);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopicId]);

  async function createTopic() {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', title: newTitle.trim(), body: newBody }),
      });
      if (res.ok) {
        setCreating(false);
        setNewTitle('');
        setNewBody('');
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function addComment() {
    if (!newComment.trim() || !current) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comment', topicId: current.id, text: newComment.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
      }
    } catch {
      /* ignore */
    }
  }

  async function setStatus(status: IdeaStatus) {
    if (!current) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'set_status', id: current.id, status }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrent(data.topic);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteTopic() {
    if (!current) return;
    try {
      await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id: current.id }),
      });
    } catch {
      /* ignore */
    }
    setCurrent(null);
    loadList();
  }

  // Создание топика
  if (creating) {
    return (
      <div className="max-w-2xl animate-fade-in">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setCreating(false)} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
            <Icon name="ArrowLeft" size={14} />
            Отмена
          </button>
          <h2 className="font-display tracking-wide text-lg">Новая идея</h2>
          <button
            onClick={createTopic}
            disabled={!newTitle.trim()}
            className="ml-auto h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Опубликовать
          </button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="О чём идея? Кратко..."
            className="w-full bg-transparent text-xl font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1.5 transition-colors placeholder:text-muted-foreground/50"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Опишите мысль подробнее: что предлагаете, зачем, какие плюсы и риски..."
            rows={6}
            className={inputCls + ' resize-none'}
          />
        </div>
      </div>
    );
  }

  // Просмотр топика
  if (current) {
    const sm = statusMeta[current.status];
    return (
      <div className="max-w-2xl animate-fade-in">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setCurrent(null)} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
            <Icon name="ArrowLeft" size={14} />
            К списку
          </button>
          {canManage(current) && (
            <div className="ml-auto flex items-center gap-2">
              {current.status !== 'open' && (
                <button onClick={() => setStatus('open')} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
                  <Icon name="RotateCcw" size={13} />
                  Переоткрыть
                </button>
              )}
              {current.status === 'open' && (
                <>
                  <button onClick={() => setStatus('sent')} className="h-8 px-3 rounded-lg border text-xs transition-colors flex items-center gap-1.5" style={{ borderColor: 'hsl(152 55% 45% / 0.5)', color: 'hsl(152 55% 55%)', background: 'hsl(152 55% 45% / 0.1)' }}>
                    <Icon name="Rocket" size={13} />
                    На реализацию
                  </button>
                  <button onClick={() => setStatus('wont_do')} className="h-8 px-3 rounded-lg border text-xs transition-colors flex items-center gap-1.5" style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 62%)', background: 'hsl(0 65% 55% / 0.1)' }}>
                    <Icon name="XCircle" size={13} />
                    Не делать
                  </button>
                </>
              )}
              <button onClick={deleteTopic} title="Удалить" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 mb-5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}>
            <Icon name={sm.icon} size={12} />
            {sm.label}
          </span>
          <h1 className="text-xl font-bold mt-3 mb-2 leading-tight">{current.title}</h1>
          <div className="text-xs text-muted-foreground mb-4 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><Icon name="User" size={12} />{authorName(current.authorId)}</span>
            <span className="flex items-center gap-1"><Icon name="Clock" size={12} />{fmtDate(current.createdAt)}</span>
          </div>
          {current.body && <p className="text-sm leading-relaxed whitespace-pre-wrap">{current.body}</p>}
        </div>

        <div className="mb-3 text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon name="MessageSquare" size={15} />
          Обсуждение {comments.length > 0 && <span className="font-mono">({comments.length})</span>}
        </div>

        <div className="space-y-3 mb-4">
          {comments.map((c) => {
            const photo = authorPhoto(c.authorId);
            const name = authorName(c.authorId);
            return (
              <div key={c.id} className="flex gap-2.5">
                {photo ? (
                  <img src={photo} alt="" className="h-8 w-8 rounded-md object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 text-muted-foreground">
                    {initialsFor(name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</span>
                  </div>
                  <div className="text-sm bg-secondary/40 rounded-lg px-3 py-2 whitespace-pre-wrap">{c.text}</div>
                </div>
              </div>
            );
          })}
          {comments.length === 0 && <div className="text-sm text-muted-foreground">Комментариев пока нет — начните обсуждение.</div>}
        </div>

        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(); }}
            placeholder="Написать комментарий... (Ctrl+Enter для отправки)"
            rows={2}
            className={inputCls + ' resize-none flex-1'}
          />
          <button
            onClick={addComment}
            disabled={!newComment.trim()}
            className="h-9 self-end px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40 transition-colors shrink-0"
          >
            <Icon name="Send" size={15} />
          </button>
        </div>
      </div>
    );
  }

  // Список топиков
  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="Lightbulb" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Идеи</h2>
        <span className="text-sm text-muted-foreground">· {list.length} тем</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Предложения и размышления о том, что стоило бы сделать. Обсуждайте в комментариях, закрывайте решённые темы.</p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Icon name="Plus" size={15} />
          Новая идея
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={26} className="animate-spin text-primary" />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Lightbulb" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Пока нет ни одной идеи — предложите первую</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((t) => {
            const sm = statusMeta[t.status];
            return (
              <button
                key={t.id}
                onClick={() => openTopic(t.id)}
                className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/50 transition-all group flex items-center gap-3"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0" style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}>
                  <Icon name={sm.icon} size={12} />
                  <span className="hidden sm:inline">{sm.label}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{authorName(t.authorId)} · {fmtDate(t.updatedAt)}</div>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Icon name="MessageSquare" size={12} />
                  {t.commentsCount}
                </span>
                <Icon name="ChevronRight" size={15} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}