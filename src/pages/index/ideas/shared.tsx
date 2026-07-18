import type { Attachment } from '@/components/AttachmentsField';

export type IdeaStatus = 'open' | 'wont_do' | 'sent';

export interface Author {
  id: number;
  name: string;
  photo_url: string | null;
}

export interface TopicListItem {
  id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  authorId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  commentsCount: number;
  attachments?: Attachment[];
}

export interface IdeaComment {
  id: string;
  topicId: string;
  authorId: number | null;
  text: string;
  createdAt: string | null;
  parentId: string | null;
  mentions: number[];
  attachments: Attachment[];
}

export const statusMeta: Record<IdeaStatus, { label: string; color: string; icon: string }> = {
  open:    { label: 'Открыто',                color: '210 80% 62%', icon: 'MessageCircle' },
  wont_do: { label: 'Решено не делать',       color: '0 65% 60%',   icon: 'XCircle' },
  sent:    { label: 'Отправлено на реализацию', color: '152 55% 50%', icon: 'Rocket' },
};

export const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

export function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initialsFor(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

// Подсветка @упоминаний и превращение ссылок в кликабельные в тексте комментария
export function renderText(text: string, names: string[]) {
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