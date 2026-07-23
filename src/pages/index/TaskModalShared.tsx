import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Attachment } from '@/components/AttachmentsField';
import type { TeamMember } from './shared';
import { resolveAssignee, AssigneeAvatar } from './shared';
import type { PrivateNote } from './usePrivateNotes';

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

export function AssigneeMultiSelect({ team, value, onChange, compact }: {
  team: TeamMember[];
  value: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
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
      <label className={`block text-muted-foreground ${compact ? 'text-[10px] mb-1' : 'text-xs mb-1.5'}`}>Исполнители</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border border-border bg-secondary/60 text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary ${compact ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-9 px-3 py-2 text-sm'}`}
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

export function PrivateNoteComposer({ team, currentUserId, onAdd, compact }: {
  team: TeamMember[];
  currentUserId: number | null;
  onAdd: (targetUserId: number, text: string) => Promise<boolean>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const candidates = team.filter((m) => m.id !== currentUserId);

  async function submit() {
    if (!targetId || !text.trim()) return;
    setSaving(true);
    const ok = await onAdd(targetId, text);
    setSaving(false);
    if (ok) {
      setText('');
      setTargetId(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors ${compact ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'}`}
      >
        <Icon name="EyeOff" size={12} />
        Приватная заметка
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-lg border border-border bg-card shadow-xl p-2.5 animate-scale-in">
          <label className="block text-[10px] text-muted-foreground mb-1">Видно только адресату и админам</label>
          <select
            value={targetId ?? ''}
            onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
            className="w-full mb-2 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Кому адресовано…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>{m.first_name}{m.last_name ? ' ' + m.last_name : ''}</option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст приватной заметки…"
            rows={3}
            className="w-full rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button onClick={() => setOpen(false)} className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Отмена
            </button>
            <button
              onClick={submit}
              disabled={!targetId || !text.trim() || saving}
              className="h-7 px-2.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PrivateNoteItem({ note, team, currentUserId, isAdmin, onRemove }: {
  note: PrivateNote;
  team: TeamMember[];
  currentUserId: number | null;
  isAdmin: boolean;
  onRemove: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const author = resolveAssignee(team, note.authorId);
  const target = resolveAssignee(team, note.targetUserId);
  const canDel = currentUserId === note.authorId || isAdmin;
  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon name="EyeOff" size={11} className="text-primary shrink-0" />
        <span>
          Приватно для <span className="font-medium text-foreground">{target.name}</span> · от {author.name}
        </span>
        <button
          onClick={() => setRevealed((v) => !v)}
          className="ml-auto text-primary hover:opacity-80 shrink-0"
        >
          {revealed ? 'Скрыть' : 'Показать'}
        </button>
        {canDel && (
          <button onClick={() => onRemove(note.id)} className="text-muted-foreground hover:text-destructive shrink-0">
            <Icon name="X" size={12} />
          </button>
        )}
      </div>
      {revealed && (
        <div className="mt-1.5 text-xs whitespace-pre-wrap break-words text-foreground">{note.text}</div>
      )}
    </div>
  );
}

export function PrivateNotesList({ notes, team, currentUserId, isAdmin, onRemove, commentId = null }: {
  notes: PrivateNote[];
  team: TeamMember[];
  currentUserId: number | null;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  commentId?: string | null;
}) {
  const filtered = notes.filter((n) => n.commentId === commentId);
  if (filtered.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {filtered.map((n) => (
        <PrivateNoteItem key={n.id} note={n} team={team} currentUserId={currentUserId} isAdmin={isAdmin} onRemove={onRemove} />
      ))}
    </div>
  );
}

export function KbMultiSelect({ articles, value, onChange, compact }: {
  articles: KbArticleBrief[];
  value: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
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
      <label className={`text-muted-foreground flex items-center gap-1.5 ${compact ? 'text-[10px] mb-1' : 'text-xs mb-1.5'}`}>
        <Icon name="BookOpen" size={compact ? 11 : 12} />
        Связанные статьи базы знаний
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border border-border bg-secondary/60 text-left flex items-center gap-1.5 flex-wrap focus:outline-none focus:ring-1 focus:ring-primary ${compact ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-9 px-3 py-2 text-sm'}`}
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