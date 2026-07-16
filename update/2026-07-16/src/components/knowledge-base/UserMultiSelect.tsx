import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { Author } from './shared';

export default function UserMultiSelect({ authors, value, onChange }: {
  authors: Author[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => authors.find((a) => a.id === id))
    .filter(Boolean) as Author[];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Никому не открыт доступ</span>}
        {selected.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs">
            {a.name}
            <span
              onClick={(e) => { e.stopPropagation(); toggle(a.id); }}
              className="hover:text-foreground cursor-pointer"
            >
              <Icon name="X" size={11} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-card p-1 max-h-52 overflow-auto scrollbar-thin">
          {authors.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В команде пока никого нет</div>}
          {authors.map((a) => {
            const active = value.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors"
              >
                <span className={`h-4 w-4 rounded flex items-center justify-center border shrink-0 ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                {a.photo_url ? (
                  <img src={a.photo_url} alt="" className="h-5 w-5 rounded-md object-cover shrink-0" />
                ) : (
                  <span className="h-5 w-5 rounded-md bg-secondary flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {a.name.slice(0, 1)}
                  </span>
                )}
                <span className="truncate">{a.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
