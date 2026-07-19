import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

export interface MentionMember {
  id: number;
  name: string;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  members: MentionMember[];
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

// Извлекает id упомянутых участников: те, чьё имя встречается как «@Имя» в тексте.
export function extractMentions(text: string, members: MentionMember[]): number[] {
  const ids: number[] = [];
  for (const m of members) {
    // экранируем спецсимволы имени
    const esc = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${esc}(?![\\p{L}\\p{N}_])`, 'u');
    if (re.test(text) && !ids.includes(m.id)) ids.push(m.id);
  }
  return ids;
}

export default function MentionInput({ value, onChange, members, onSubmit, placeholder, rows = 2, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [atPos, setAtPos] = useState(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const filtered = open
    ? members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    onChange(text);
    const caret = e.target.selectionStart;
    // ищем ближайший '@' перед курсором без пробела/переноса
    const upto = text.slice(0, caret);
    const match = upto.match(/@([\p{L}\p{N}_ ]{0,30})$/u);
    if (match) {
      setOpen(true);
      setQuery(match[1]);
      setAtPos(caret - match[0].length);
      setActiveIdx(0);
    } else {
      setOpen(false);
    }
  }

  function pick(m: MentionMember) {
    if (!ref.current) return;
    const caret = ref.current.selectionStart;
    const before = value.slice(0, atPos);
    const after = value.slice(caret);
    const insert = `@${m.name} `;
    const next = before + insert + after;
    onChange(next);
    setOpen(false);
    // вернуть фокус и поставить курсор после вставки
    requestAnimationFrame(() => {
      if (ref.current) {
        const pos = (before + insert).length;
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(filtered[activeIdx]); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 z-30 w-56 rounded-lg border border-border bg-card shadow-xl p-1 animate-scale-in">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">Упомянуть участника</div>
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${i === activeIdx ? 'bg-secondary/70' : 'hover:bg-secondary/50'}`}
            >
              <Icon name="AtSign" size={13} className="text-primary shrink-0" />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}