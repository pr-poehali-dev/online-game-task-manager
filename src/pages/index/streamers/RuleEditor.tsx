import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { MatchMode } from './streamersTypes';

interface Props {
  initialKeywords: string[];
  initialMode: MatchMode;
  saveLabel: string;
  onSave: (keywords: string[], mode: MatchMode) => Promise<string | null>;
  onCancel?: () => void;
}

const MODES: { id: MatchMode; label: string; hint: string }[] = [
  { id: 'any', label: 'Любое слово', hint: 'Достаточно одного из слов в названии' },
  { id: 'all', label: 'Все слова', hint: 'В названии должны быть все слова сразу' },
];

function normalize(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase();
}

export default function RuleEditor({ initialKeywords, initialMode, saveLabel, onSave, onCancel }: Props) {
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [mode, setMode] = useState<MatchMode>(initialMode);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function addWords(raw: string) {
    const parts = raw.split(',').map(normalize).filter(Boolean);
    if (parts.length === 0) return;
    setKeywords((prev) => {
      const next = [...prev];
      for (const w of parts) if (!next.includes(w)) next.push(w);
      return next.slice(0, 20);
    });
    setDraft('');
    setError('');
  }

  async function submit() {
    const pending = normalize(draft);
    const finalWords = pending && !keywords.includes(pending) ? [...keywords, pending] : keywords;
    if (finalWords.length === 0) {
      setError('Добавьте хотя бы одно слово');
      return;
    }
    setBusy(true);
    setError('');
    const err = await onSave(finalWords, mode);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Слова для поиска в названии трансляции (регистр не важен)</div>
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-background">
          {keywords.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary text-xs font-medium pl-2 pr-1 py-1">
              {w}
              <button onClick={() => setKeywords((prev) => prev.filter((x) => x !== w))} className="hover:text-destructive" title="Убрать слово">
                <Icon name="X" size={12} />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) addWords(draft); else submit(); }
              if (e.key === 'Backspace' && !draft && keywords.length) setKeywords((prev) => prev.slice(0, -1));
            }}
            onBlur={() => { if (draft.trim()) addWords(draft); }}
            placeholder={keywords.length ? 'Ещё слово…' : 'Например: la2era'}
            maxLength={60}
            className="flex-1 min-w-32 h-7 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">Enter или запятая добавляют слово</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`text-left rounded-lg border p-2.5 transition-colors ${
              mode === m.id ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-secondary/40'
            }`}
          >
            <div className={`text-sm font-medium ${mode === m.id ? 'text-primary' : 'text-foreground'}`}>{m.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{m.hint}</div>
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={12} />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
          {busy && <Icon name="Loader2" size={12} className="animate-spin" />}
          {saveLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={busy} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50">Отмена</button>
        )}
      </div>
    </div>
  );
}
