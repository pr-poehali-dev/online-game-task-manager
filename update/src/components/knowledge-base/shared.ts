import func2url from '../../../backend/func2url.json';

export const KNOWLEDGE_URL = (func2url as Record<string, string>).knowledge;
const TOKEN_KEY = 'era_auth_token';

export function kbAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

export const authHeaders = kbAuthHeaders;

export interface KbArticleBrief {
  id: string;
  title: string;
  category: string;
}

export type KbCategoryId = 'web' | 'launcher' | 'client' | 'social' | 'ads' | 'server-ext' | 'server-scripts' | 'other';

export const kbCategories: { id: KbCategoryId; label: string; icon: string; color: string }[] = [
  { id: 'web', label: 'Веб', icon: 'Globe', color: '210 80% 62%' },
  { id: 'launcher', label: 'Лаунчер', icon: 'MonitorDown', color: '270 65% 65%' },
  { id: 'client', label: 'Клиент', icon: 'Gamepad2', color: '35 85% 58%' },
  { id: 'social', label: 'Соцсети и форум', icon: 'MessagesSquare', color: '330 70% 62%' },
  { id: 'ads', label: 'Реклама', icon: 'Megaphone', color: '45 90% 55%' },
  { id: 'server-ext', label: 'Сервер · Экст', icon: 'Database', color: '0 65% 60%' },
  { id: 'server-scripts', label: 'Сервер · Скрипты', icon: 'Code2', color: '152 55% 50%' },
  { id: 'other', label: 'Прочее', icon: 'MoreHorizontal', color: '215 15% 55%' },
];

export function kbCatMeta(id: string) {
  return kbCategories.find((c) => c.id === id) ?? kbCategories[kbCategories.length - 1];
}

export interface ArticleListItem {
  id: string;
  title: string;
  category: KbCategoryId;
  excerpt: string | null;
  authorId: number | null;
  updatedById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  isFavorite?: boolean;
}

export interface KbAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface Article extends ArticleListItem {
  content: string;
  attachments?: KbAttachment[];
}

export function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function fileIconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'FileText';
  if (['doc', 'docx'].includes(ext)) return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'FileSpreadsheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'FileArchive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'FileImage';
  return 'File';
}

export interface Author {
  id: number;
  name: string;
  photo_url: string | null;
}

export const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

export function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
