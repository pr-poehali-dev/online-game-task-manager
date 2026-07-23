import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import { PATCHNOTES_URL, authHeaders, servers, formatMskDateTime } from './shared';
import type { ServerId } from './shared';

interface PatchnoteEntry {
  id: number;
  server: string;
  taskId: string | null;
  taskTitle: string;
  createdAt: string | null;
}

export default function Patchnotes() {
  const { isAdmin } = useAuth();
  const [active, setActive] = useState<ServerId>(servers[0].id);
  const [entries, setEntries] = useState<PatchnoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async (server: ServerId) => {
    setLoading(true);
    try {
      const res = await fetch(`${PATCHNOTES_URL}?server=${encodeURIComponent(server)}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  const activeSrv = servers.find((s) => s.id === active) ?? servers[0];

  function copyAll() {
    const text = entries
      .map((e) => `${formatMskDateTime(e.createdAt)} — ${e.taskTitle}`)
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function startEdit(e: PatchnoteEntry) {
    setEditingId(e.id);
    setEditValue(e.taskTitle);
  }

  async function saveEdit(id: number) {
    const taskTitle = editValue.trim();
    if (!taskTitle) return;
    setSaving(true);
    try {
      const res = await fetch(PATCHNOTES_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update', id, taskTitle }),
      });
      if (res.ok) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, taskTitle } : e)));
        setEditingId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: number) {
    if (!window.confirm('Удалить эту запись из патчноута?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(PATCHNOTES_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="ScrollText" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Патчноуты</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Автоматический журнал изменений по каждому серверу — заполняется при отметке «Реализовано»
        в разделе «К рестарту».
      </p>

      <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg mb-4 w-fit">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: active === s.id ? 'currentColor' : `hsl(${s.color})` }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon name="FileText" size={14} className="text-muted-foreground" />
            {activeSrv.label}.txt
            <span className="text-xs text-muted-foreground font-normal">· {entries.length} записей</span>
          </div>
          <button
            onClick={copyAll}
            disabled={entries.length === 0}
            title="Скопировать весь текст"
            className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 flex items-center gap-1.5"
          >
            <Icon name="Copy" size={12} />
            Копировать
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={24} className="animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Icon name="ScrollText" size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Пока нет записей для этого сервера</p>
          </div>
        ) : (
          <div className="p-4 font-mono text-sm space-y-1.5 max-h-[60vh] overflow-auto scrollbar-thin">
            {entries.map((e) => (
              <div key={e.id} className="group flex items-start gap-2 leading-relaxed">
                <span className="text-muted-foreground shrink-0">{formatMskDateTime(e.createdAt)}</span>
                <span className="text-muted-foreground/60 shrink-0">—</span>
                {editingId === e.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(ev) => setEditValue(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') saveEdit(e.id);
                        if (ev.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 min-w-0 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => saveEdit(e.id)}
                      disabled={saving}
                      className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                    >
                      <Icon name={saving ? 'Loader2' : 'Check'} size={13} className={saving ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Icon name="X" size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="break-words flex-1">{e.taskTitle}</span>
                    {e.taskId && (
                      <a
                        href={`/task/${e.taskId}`}
                        title="Открыть задачу"
                        className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Icon name="ExternalLink" size={13} />
                      </a>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => startEdit(e)}
                        title="Редактировать запись"
                        className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Icon name="Pencil" size={13} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => deleteEntry(e.id)}
                        disabled={deletingId === e.id}
                        title="Удалить запись"
                        className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <Icon name={deletingId === e.id ? 'Loader2' : 'Trash2'} size={13} className={deletingId === e.id ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}