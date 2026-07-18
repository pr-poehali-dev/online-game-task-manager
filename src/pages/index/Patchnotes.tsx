import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
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
  const [active, setActive] = useState<ServerId>(servers[0].id);
  const [entries, setEntries] = useState<PatchnoteEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-3xl animate-fade-in">
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
              <div key={e.id} className="flex gap-2 leading-relaxed">
                <span className="text-muted-foreground shrink-0">{formatMskDateTime(e.createdAt)}</span>
                <span className="text-muted-foreground/60 shrink-0">—</span>
                <span className="break-words">{e.taskTitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
