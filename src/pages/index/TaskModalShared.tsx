import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { KbArticleBrief } from '@/components/KnowledgeBase';
import type { Attachment } from '@/components/AttachmentsField';
import type { TeamMember } from './shared';
import { resolveAssignee, AssigneeAvatar } from './shared';
import { useCatalog } from '@/lib/catalog';
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
      <label className={`block text-muted-foreground ${compact ? 'text-[11px] tracking-[0.01em] mb-1' : 'text-xs mb-1.5'}`}>Исполнители</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border border-border bg-secondary/50 text-left flex items-center gap-1.5 flex-wrap transition-all duration-200 ease-premium hover:bg-secondary/70 focus:outline-none focus:border-primary/50 focus:bg-secondary/70 ${compact ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-9 px-3 py-2 text-sm'}`}
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не назначен</span>}
        {selected.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs">
            {m.first_name}{m.last_name ? ' ' + m.last_name[0] + '.' : ''}
            <span
              onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
              className="hover:text-foreground cursor-pointer"
            >
              <Icon name="X" size={12} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border/70 bg-popover shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.04),0_8px_24px_-12px_hsl(222_30%_2%/0.5)] p-1 max-h-52 overflow-auto scrollbar-thin">
          {team.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В команде пока никого нет</div>}
          {team.map((m) => {
            const active = value.includes(m.id);
            const name = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-all duration-200 ease-premium"
              >
                <span className={`h-4 w-4 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={12} />}
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

// Выбор СЕРВЕРОВ задачи. Одна правка часто выкатывается сразу на несколько серверов, поэтому
// выбор множественный (по образцу AssigneeMultiSelect). Пустой список допустим — задача может быть
// не привязана к серверу.
export function ServerMultiSelect({ value, onChange, compact }: {
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const { servers, serverMeta } = useCatalog();
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div>
      <label className={`block text-muted-foreground ${compact ? 'text-[11px] tracking-[0.01em] mb-1' : 'text-xs mb-1.5'}`}>Серверы</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border border-border bg-secondary/50 text-left flex items-center gap-1.5 flex-wrap transition-all duration-200 ease-premium hover:bg-secondary/70 focus:outline-none focus:border-primary/50 focus:bg-secondary/70 ${compact ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-9 px-3 py-2 text-sm'}`}
      >
        {value.length === 0 && <span className="text-muted-foreground">Не выбран</span>}
        {value.map((id) => {
          const m = serverMeta(id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
              style={{ background: `hsl(${m.color} / 0.15)`, color: `hsl(${m.color})` }}
            >
              {m.label}
              <span
                onClick={(e) => { e.stopPropagation(); toggle(id); }}
                className="hover:opacity-70 cursor-pointer"
              >
                <Icon name="X" size={12} />
              </span>
            </span>
          );
        })}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border/70 bg-popover shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.04),0_8px_24px_-12px_hsl(222_30%_2%/0.5)] p-1 max-h-52 overflow-auto scrollbar-thin">
          {servers.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">Серверов пока нет</div>}
          {servers.map((srv) => {
            const active = value.includes(srv.id);
            return (
              <button
                key={srv.id}
                type="button"
                onClick={() => toggle(srv.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-all duration-200 ease-premium"
              >
                <span className={`h-4 w-4 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={12} />}
                </span>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `hsl(${srv.color})` }} />
                <span className="truncate">{srv.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PrivateNoteComposer({ team, currentUserId, onAdd, variant = 'button', align = 'left' }: {
  team: TeamMember[];
  currentUserId: number | null;
  onAdd: (targetUserId: number, text: string) => Promise<boolean>;
  variant?: 'button' | 'icon';
  align?: 'left' | 'right';
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
      {variant === 'icon' ? (
        <button
          type="button"
          title="Приватная заметка"
          onClick={() => setOpen((v) => !v)}
          className={`h-7 w-7 flex items-center justify-center rounded-md text-sm transition-all duration-200 ease-premium ${
            open ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
        >
          <Icon name="EyeOff" size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-all duration-200 ease-premium"
        >
          <Icon name="EyeOff" size={12} />
          Приватная заметка
        </button>
      )}
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-30 w-72 rounded-lg border border-border/70 bg-popover shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.05),0_24px_56px_-16px_hsl(222_30%_2%/0.6)] p-2.5 animate-scale-in`}>
          <label className="block text-[11px] tracking-[0.01em] text-muted-foreground mb-1">Видно только адресату (и тем, кому выдано право просмотра чужих приватных сообщений)</label>
          <select
            value={targetId ?? ''}
            onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
            className="w-full mb-2 rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-xs text-foreground transition-all duration-200 ease-premium focus:outline-none focus:border-primary/50 focus:bg-secondary/70"
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
            className="w-full rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 transition-all duration-200 ease-premium focus:outline-none focus:border-primary/50 focus:bg-secondary/70 resize-none"
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button onClick={() => setOpen(false)} className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 ease-premium">
              Отмена
            </button>
            <button
              onClick={submit}
              disabled={!targetId || !text.trim() || saving}
              className="h-7 px-2.5 rounded-md text-xs bg-gradient-to-b from-[hsl(38_90%_60%)] to-[hsl(38_85%_50%)] text-primary-foreground shadow-accent hover:shadow-accent-hover hover:brightness-[1.06] active:translate-y-px disabled:opacity-40 disabled:shadow-none transition-all duration-200 ease-premium"
            >
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Приватная заметка отображается как встроенный в тело комментария/описания спойлер —
// текст на сервере по-прежнему хранится и передаётся в браузер только автору, адресату и тем,
// у кого есть право просмотра чужих приватных сообщений (см. backend/tasks/index.py action private_notes),
// поэтому визуальное «раскрытие» здесь ничего не рассекречивает — скрытый текст просто ещё не существует
// в браузерах остальных пользователей.
// Крестик удаления показывается только когда список отрендерен в контексте редактора (editable=true) —
// на главной странице задачи (в режиме просмотра) заметку можно только прочитать, не удалить.
function PrivateNoteItem({ note, team, currentUserId, isAdmin, onRemove, editable }: {
  note: PrivateNote;
  team: TeamMember[];
  currentUserId: number | null;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  editable: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const author = resolveAssignee(team, note.authorId);
  const target = resolveAssignee(team, note.targetUserId);
  const canDel = editable && (currentUserId === note.authorId || isAdmin);
  return (
    <div className="group/note flex items-start gap-1.5">
      <Icon name="EyeOff" size={12} className="text-primary shrink-0 mt-0.5" />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="flex-1 min-w-0 text-left"
      >
        {revealed ? (
          <span className="text-sm whitespace-pre-wrap break-words text-foreground">{note.text}</span>
        ) : (
          <span className="text-xs text-muted-foreground italic hover:text-primary transition-all duration-200 ease-premium">
            Приватно для {target.name} — нажмите, чтобы показать
          </span>
        )}
      </button>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/note:opacity-100 transition-opacity">
        {revealed && <span className="text-[11px] text-muted-foreground whitespace-nowrap">от {author.name}</span>}
        {canDel && (
          <button onClick={() => onRemove(note.id)} className="text-muted-foreground hover:text-destructive">
            <Icon name="X" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function PrivateNotesList({ notes, team, currentUserId, isAdmin, onRemove, commentId = null, editable = true }: {
  notes: PrivateNote[];
  team: TeamMember[];
  currentUserId: number | null;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  commentId?: string | null;
  editable?: boolean;
}) {
  const filtered = notes.filter((n) => n.commentId === commentId);
  if (filtered.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {filtered.map((n) => (
        <PrivateNoteItem key={n.id} note={n} team={team} currentUserId={currentUserId} isAdmin={isAdmin} onRemove={onRemove} editable={editable} />
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
      <label className={`text-muted-foreground flex items-center gap-1.5 ${compact ? 'text-[11px] tracking-[0.01em] mb-1' : 'text-xs mb-1.5'}`}>
        <Icon name="BookOpen" size={compact ? 11 : 12} />
        Связанные статьи базы знаний
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg border border-border bg-secondary/50 text-left flex items-center gap-1.5 flex-wrap transition-all duration-200 ease-premium hover:bg-secondary/70 focus:outline-none focus:border-primary/50 focus:bg-secondary/70 ${compact ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-9 px-3 py-2 text-sm'}`}
      >
        {selected.length === 0 && <span className="text-muted-foreground">Не выбрано</span>}
        {selected.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs max-w-[200px]">
            <span className="truncate">{a.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); toggle(Number(a.id)); }}
              className="hover:text-foreground cursor-pointer shrink-0"
            >
              <Icon name="X" size={12} />
            </span>
          </span>
        ))}
        <Icon name="ChevronDown" size={14} className="ml-auto text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border/70 bg-popover shadow-[inset_0_1px_0_0_hsl(210_40%_100%/0.04),0_8px_24px_-12px_hsl(222_30%_2%/0.5)] p-1 max-h-52 overflow-auto scrollbar-thin">
          {articles.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">В базе знаний пока нет статей</div>}
          {articles.map((a) => {
            const active = value.includes(Number(a.id));
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(Number(a.id))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-secondary/60 transition-all duration-200 ease-premium text-left"
              >
                <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${active ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {active && <Icon name="Check" size={12} />}
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