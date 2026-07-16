import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import type { PermissionKey } from '@/lib/auth';
import func2url from '../../backend/func2url.json';

export const KNOWLEDGE_URL = (func2url as Record<string, string>).knowledge;
const TOKEN_KEY = 'era_auth_token';

export function kbAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

const authHeaders = kbAuthHeaders;

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

function kbCatMeta(id: string) {
  return kbCategories.find((c) => c.id === id) ?? kbCategories[kbCategories.length - 1];
}

interface ArticleListItem {
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

interface Article extends ArticleListItem {
  content: string;
  attachments?: KbAttachment[];
}

function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileIconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'FileText';
  if (['doc', 'docx'].includes(ext)) return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'FileSpreadsheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'FileArchive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'FileImage';
  return 'File';
}

interface Author {
  id: number;
  name: string;
  photo_url: string | null;
}

const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

function CatBadge({ id }: { id: string }) {
  const c = kbCatMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
      style={{ background: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}
    >
      <Icon name={c.icon} size={10} />
      {c.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function KnowledgeBase({ category, authors, initialArticleId, onConsumeInitial, can, isAdmin }: {
  category: KbCategoryId | 'all';
  authors: Author[];
  initialArticleId?: string | null;
  onConsumeInitial?: () => void;
  can: (key: PermissionKey) => boolean;
  isAdmin: boolean;
}) {
  const [list, setList] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<Article | null>(null);
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const authorName = (id: number | null) => (id != null ? authors.find((a) => a.id === id)?.name ?? 'Участник' : '—');

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(KNOWLEDGE_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setList(data.articles || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openArticle = useCallback(async (id: string) => {
    try {
      const res = await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'get', id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.article) setCurrent(data.article);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (initialArticleId) {
      openArticle(initialArticleId);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArticleId]);

  async function saveArticle(payload: { id?: string; title: string; category: KbCategoryId; excerpt: string; content: string; attachments: KbAttachment[] }) {
    const action = payload.id ? 'update' : 'create';
    try {
      const res = await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        const data = await res.json();
        setEditing(null);
        setCurrent(data.article);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteArticle(id: string) {
    try {
      await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
    } catch {
      /* ignore */
    }
    setCurrent(null);
    setList((prev) => prev.filter((a) => a.id !== id));
  }

  async function toggleFavorite(id: string) {
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, isFavorite: !a.isFavorite } : a)));
    setCurrent((prev) => (prev && prev.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev));
    try {
      await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'toggle_favorite', id }),
      });
    } catch {
      /* ignore */
    }
  }

  const filtered = list
    .filter((a) => category === 'all' || a.category === category)
    .filter((a) => !favoritesOnly || a.isFavorite)
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || (a.excerpt ?? '').toLowerCase().includes(q);
    });

  if (editing) {
    return (
      <ArticleEditor
        article={editing === 'new' ? null : editing}
        defaultCategory={category === 'all' ? 'other' : category}
        onCancel={() => setEditing(null)}
        onSave={saveArticle}
      />
    );
  }

  if (current) {
    return (
      <ArticleView
        article={current}
        authorName={authorName}
        onBack={() => setCurrent(null)}
        onEdit={() => setEditing(current)}
        onDelete={() => deleteArticle(current.id)}
        onToggleFavorite={() => toggleFavorite(current.id)}
        canEdit={can('kb_edit')}
        canDelete={isAdmin}
      />
    );
  }

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="BookOpen" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">База знаний</h2>
        <span className="text-sm text-muted-foreground">· {list.length} статей</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Статьи и готовые решения под рабочие задачи. Выбирайте категорию слева или ищите по названию.</p>

      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по статьям..."
            className={inputCls + ' pl-9'}
          />
        </div>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          title={favoritesOnly ? 'Показать все статьи' : 'Показать только избранное'}
          className={`h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0 ${
            favoritesOnly ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <Icon name="Star" size={15} className={favoritesOnly ? 'fill-current' : ''} />
          <span className="hidden sm:inline">Избранное</span>
        </button>
        {can('kb_create') && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Icon name="Plus" size={15} />
            <span className="hidden sm:inline">Статья</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={26} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="BookOpen" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{search.trim() ? 'Ничего не найдено' : 'Здесь пока нет статей — создайте первую'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((a) => (
            <div
              key={a.id}
              onClick={() => openArticle(a.id)}
              className="relative text-left rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2 pr-6">
                <CatBadge id={a.category} />
                <Icon name="ChevronRight" size={15} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(a.id); }}
                title={a.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                className={`absolute top-3.5 right-3.5 h-6 w-6 flex items-center justify-center rounded-md transition-colors ${
                  a.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/50 hover:text-yellow-400'
                }`}
              >
                <Icon name="Star" size={15} className={a.isFavorite ? 'fill-current' : ''} />
              </button>
              <h3 className="text-sm font-semibold leading-snug mb-1 line-clamp-2">{a.title}</h3>
              {a.excerpt && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{a.excerpt}</p>}
              <div className="text-[11px] text-muted-foreground mt-auto flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Icon name="User" size={11} />{authorName(a.authorId)}</span>
                <span className="flex items-center gap-1"><Icon name="Clock" size={11} />{fmtDate(a.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleView({ article, authorName, onBack, onEdit, onDelete, onToggleFavorite, canEdit, canDelete }: {
  article: Article;
  authorName: (id: number | null) => string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          К списку
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggleFavorite}
            title={article.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
            className={`h-8 px-3 rounded-lg border text-sm transition-colors flex items-center gap-1.5 ${
              article.isFavorite ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            <Icon name="Star" size={13} className={article.isFavorite ? 'fill-current' : ''} />
            <span className="hidden sm:inline">{article.isFavorite ? 'В избранном' : 'В избранное'}</span>
          </button>
          {canEdit && (
            <button onClick={onEdit} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
              <Icon name="Pencil" size={13} />
              Редактировать
            </button>
          )}
          {canDelete && (confirmDel ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground hidden sm:inline">Удалить?</span>
              <button onClick={onDelete} className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors">Да</button>
              <button onClick={() => setConfirmDel(false)} className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">Нет</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center">
              <Icon name="Trash2" size={14} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <CatBadge id={article.category} />
        <h1 className="text-2xl font-bold mt-3 mb-2 leading-tight">{article.title}</h1>
        <div className="text-xs text-muted-foreground mb-5 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Icon name="User" size={12} />{authorName(article.authorId)}</span>
          {article.createdAt && (
            <span className="flex items-center gap-1"><Icon name="Calendar" size={12} />Создано {fmtDate(article.createdAt)}</span>
          )}
          <span className="flex items-center gap-1"><Icon name="Clock" size={12} />Обновлено {fmtDate(article.updatedAt)}</span>
        </div>
        <div className="kb-content prose-invert" dangerouslySetInnerHTML={{ __html: article.content || '<p class="text-muted-foreground">Статья пока пуста.</p>' }} />

        {!!article.attachments?.length && (
          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Icon name="Paperclip" size={12} />
              Вложения ({article.attachments.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {article.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50 hover:bg-secondary/40 transition-colors"
                >
                  <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
                  <Icon name="Download" size={13} className="text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleEditor({ article, defaultCategory, onCancel, onSave }: {
  article: Article | null;
  defaultCategory: KbCategoryId;
  onCancel: () => void;
  onSave: (p: { id?: string; title: string; category: KbCategoryId; excerpt: string; content: string; attachments: KbAttachment[] }) => void;
}) {
  const [title, setTitle] = useState(article?.title ?? '');
  const [category, setCategory] = useState<KbCategoryId>(article?.category ?? defaultCategory);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');
  const [content, setContent] = useState(article?.content ?? '');
  const [attachments, setAttachments] = useState<KbAttachment[]>(article?.attachments ?? []);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);

  async function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file: File): Promise<string> {
    const dataUrl = await readAsDataUrl(file);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const res = await fetch(KNOWLEDGE_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'upload_image', data: dataUrl, ext, contentType: file.type }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.url || '';
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    setUploadingFile(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'upload_file', data: dataUrl, name: file.name, contentType: file.type }),
      });
      const d = await res.json();
      if (!res.ok) {
        setUploadError(d.error === 'file_too_large' ? 'Файл слишком большой (максимум 20 МБ)' : 'Не удалось загрузить файл');
        return;
      }
      if (d.attachment) setAttachments((prev) => [...prev, d.attachment]);
    } catch {
      setUploadError('Не удалось загрузить файл');
    } finally {
      setUploadingFile(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    onSave({ id: article?.id, title: title.trim(), category, excerpt: excerpt.trim(), content, attachments });
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          Отмена
        </button>
        <h2 className="font-display tracking-wide text-lg">{article ? 'Редактирование статьи' : 'Новая статья'}</h2>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          className="ml-auto h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
        >
          {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
          Сохранить
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок статьи..."
          className="w-full bg-transparent text-xl font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1.5 transition-colors placeholder:text-muted-foreground/50"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KbCategoryId)}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {kbCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Краткое описание</label>
            <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="1-2 предложения для списка" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Содержание</label>
          <RichEditor content={content} onChange={setContent} onImageUpload={uploadImage} placeholder="Опишите решение: шаги, изображения, ссылки..." />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Вложения (документы, архивы и другие файлы)</label>
          {!!attachments.length && (
            <div className="flex flex-col gap-1.5 mb-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    title="Убрать вложение"
                    className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer">
            <Icon name={uploadingFile ? 'Loader2' : 'Paperclip'} size={14} className={uploadingFile ? 'animate-spin' : ''} />
            {uploadingFile ? 'Загрузка...' : 'Прикрепить файл'}
            <input type="file" className="hidden" onChange={handleAttachFile} disabled={uploadingFile} />
          </label>
          {uploadError && <p className="text-xs text-destructive mt-1.5">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}