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

// Подсветка @упоминаний в тексте комментария
export function renderText(text: string, names: string[]) {
  if (names.length === 0) return text;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${esc.join('|')})`, 'gu');
  const parts: (string | { m: string })[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ m: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === 'string'
      ? <span key={i}>{p}</span>
      : <span key={i} className="text-primary font-medium">{p.m}</span>
  );
}
