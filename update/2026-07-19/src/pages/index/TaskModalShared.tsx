import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Attachment } from '@/components/AttachmentsField';
import type { TeamMember } from './shared';
import { resolveAssignee, AssigneeAvatar } from './shared';

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: number | null;
  text: string;
  createdAt: string | null;
  parentId: string | null;
  mentions: number[];
  attachments: Attachment[];
}

export function renderMentionText(text: string, names: string[]) {
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const pattern = esc.length > 0 ? `(https?:\\/\\/[^\\s]+)|(@(?:${esc.join('|')}))` : `(https?:\\/\\/[^\\s]+)`;
  const re = new RegExp(pattern, 'gu');
  const parts: (string | { url: string } | { mention: string })[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) parts.push({ url: match[1] });
    else if (match[2]) parts.push({ mention: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) => {
    if (typeof p === 'string') return <span key={i}>{p}</span>;
    if ('url' in p) {
      return (
        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary underline hover:opacity-80 break-all">
          {p.url}
        </a>
      );
    }
    return <span key={i} className="text-primary font-medium">{p.mention}</span>;
  });
}

export function AssigneeMultiSelect({ team, value, onChange }: {
  team: TeamMember[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => team.find((m) => m.id === id))
    .filter(Boolean) as TeamMember[];

  return (
    <div className="md:col-span-2">
      <label className="block text-xs text-muted-foreground mb-1.5">Исполнители</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не назначен</span>}
        {selected.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs">
            {m.first_name}{m.last_name ? ' ' + m.last_name[0] + '.' : ''}
            <span
              onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
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
          {team.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В команде пока никого нет</div>}
          {team.map((m) => {
            const active = value.includes(m.id);
            const name = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors"
              >
                <span className={`h-4 w-4 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                <AssigneeAvatar a={resolveAssignee(team, m.id)} size={20} />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function KbMultiSelect({ articles, value, onChange }: {
  articles: KbArticleBrief[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const selected = value
    .map((id) => articles.find((a) => Number(a.id) === id))
    .filter(Boolean) as KbArticleBrief[];

  return (
    <div className="md:col-span-2">
      <label className="block text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Icon name="BookOpen" size={12} />
        Связанные статьи базы знаний
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-9 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не выбрано</span>}
        {selected.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs max-w-[200px]">
            <span className="truncate">{a.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); toggle(Number(a.id)); }}
              className="hover:text-foreground cursor-pointer shrink-0"
            >
              <Icon name="X" size={11} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-card p-1 max-h-52 overflow-auto scrollbar-thin">
          {articles.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В базе знаний пока нет статей</div>}
          {articles.map((a) => {
            const active = value.includes(Number(a.id));
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(Number(a.id))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-colors text-left"
              >
                <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={11} />}
                </span>
                <span className="truncate">{a.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}