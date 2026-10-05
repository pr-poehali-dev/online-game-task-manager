import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  onAdd: (url: string, note: string) => Promise<string | null>;
}

export default function AddStreamerForm({ onAdd }: Props) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError('');
    const err = await onAdd(url.trim(), note.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setUrl('');
    setNote('');
  }

  return (
    <div className="rounded-xl border border-border p-3 sm:p-4 mb-4">
      <div className="text-sm font-medium mb-2">Добавить стримера</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Icon name="Link" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="https://kick.com/ник"
            className="h-9 w-full pl-8 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Заметка (необязательно)"
          maxLength={300}
          className="h-9 sm:w-64 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={submit}
          disabled={!url.trim() || busy}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          <Icon name={busy ? 'Loader2' : 'Plus'} size={14} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Проверяю канал…' : 'Добавить'}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
