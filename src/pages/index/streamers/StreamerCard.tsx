import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { hueFor } from '../shared';
import type { Streamer } from './streamersTypes';

interface Props {
  streamer: Streamer;
  canEdit: boolean;
  onUpdate: (id: number, patch: Record<string, unknown>) => Promise<string | null>;
  onRemove: (id: number) => Promise<string | null>;
}

function formatDuration(startIso: string, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - new Date(startIso).getTime()) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export default function StreamerCard({ streamer, canEdit, onUpdate, onRemove }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState(streamer.note || '');
  const [editingNote, setEditingNote] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!streamer.live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [streamer.live]);

  useEffect(() => {
    if (!editingNote) setNote(streamer.note || '');
  }, [streamer.note, editingNote]);

  const live = streamer.live;
  const hue = hueFor(streamer.channelSlug);

  async function togglePause(next: boolean) {
    setBusy(true);
    setError('');
    const err = await onUpdate(streamer.id, { isActive: next });
    setBusy(false);
    if (err) setError(err);
  }

  async function saveNote() {
    setBusy(true);
    setError('');
    const err = await onUpdate(streamer.id, { note });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setEditingNote(false);
  }

  async function remove() {
    setBusy(true);
    setError('');
    const err = await onRemove(streamer.id);
    setBusy(false);
    setConfirmDelete(false);
    if (err) setError(err);
  }

  return (
    <div className={`rounded-xl border p-3 sm:p-4 transition-colors ${live ? 'border-primary/50 bg-primary/5' : 'border-border'} ${!streamer.isActive ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        {streamer.avatarUrl ? (
          <img src={streamer.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
        ) : (
          <div
            className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold text-white"
            style={{ background: `hsl(${hue})` }}
          >
            {streamer.displayName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={streamer.channelUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors truncate"
            >
              {streamer.displayName}
            </a>
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 text-red-500 text-xs font-medium px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                В эфире
              </span>
            ) : streamer.isActive ? (
              <span className="rounded-full bg-secondary text-muted-foreground text-xs px-2 py-0.5">Не в эфире</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary text-muted-foreground text-xs px-2 py-0.5">
                <Icon name="Pause" size={10} />
                На паузе
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">kick.com/{streamer.channelSlug}</div>

          {live && (
            <div className="mt-2 space-y-1.5">
              <div className="text-sm text-foreground break-words">{live.title || 'Без названия'}</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Icon name="Users" size={12} />{live.viewers} зрителей</span>
                <span className="flex items-center gap-1"><Icon name="Clock" size={12} />{formatDuration(live.startedAt, now)}</span>
                {live.category && <span className="flex items-center gap-1"><Icon name="Gamepad2" size={12} />{live.category}</span>}
                <span className={`flex items-center gap-1 font-medium ${live.ruleMatched ? 'text-green-500' : 'text-amber-500'}`}>
                  <Icon name={live.ruleMatched ? 'CheckCircle2' : 'AlertTriangle'} size={12} />
                  {live.ruleMatched ? 'Условие выполнено' : 'Нет нужного слова в названии'}
                </span>
              </div>
            </div>
          )}

          <div className="mt-2">
            {editingNote ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
                  maxLength={300}
                  autoFocus
                  placeholder="Заметка"
                  className="h-8 flex-1 px-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button onClick={saveNote} disabled={busy} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">Сохранить</button>
                  <button onClick={() => setEditingNote(false)} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs">
                <Icon name="StickyNote" size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span className={`break-words ${streamer.note ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {streamer.note || 'Заметки нет'}
                </span>
                {canEdit && (
                  <button onClick={() => setEditingNote(true)} className="text-muted-foreground hover:text-primary shrink-0" title="Изменить заметку">
                    <Icon name="Pencil" size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-2 text-xs text-destructive flex items-center gap-1.5">
              <Icon name="AlertCircle" size={12} />
              {error}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              Мониторинг
              <Switch checked={streamer.isActive} disabled={busy} onCheckedChange={togglePause} />
            </label>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button onClick={remove} disabled={busy} className="h-7 px-2.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium disabled:opacity-50">Удалить</button>
                <button onClick={() => setConfirmDelete(false)} className="h-7 px-2.5 rounded-md border border-border text-xs hover:bg-secondary/50">Нет</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive transition-colors" title="Удалить стримера">
                <Icon name="Trash2" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
