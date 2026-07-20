import { useState, useEffect, useCallback } from 'react';
import type { PermissionKey } from '@/lib/auth';
import { KNOWLEDGE_URL, authHeaders } from './knowledge-base/shared';
import ArticleList from './knowledge-base/ArticleList';
import ArticleView from './knowledge-base/ArticleView';
import ArticleEditor from './knowledge-base/ArticleEditor';
import type { ArticleListItem, Article, KbCategoryId, KbAttachment, KbVisibility, Author } from './knowledge-base/shared';

export { KNOWLEDGE_URL, kbAuthHeaders, kbCategories } from './knowledge-base/shared';
export type { KbArticleBrief, KbCategoryId, KbAttachment } from './knowledge-base/shared';

export default function KnowledgeBase({ category, authors, initialArticleId, can, isAdmin, onOpenArticleById, onBack }: {
  category: KbCategoryId | 'all';
  authors: Author[];
  initialArticleId?: string | null;
  can: (key: PermissionKey) => boolean;
  isAdmin: boolean;
  onOpenArticleById: (id: string) => void;
  onBack: () => void;
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

  // Открытие/закрытие статьи синхронизировано с адресом в браузере (initialArticleId приходит из
  // URL /kb/:id) — поэтому кнопка «назад» тоже корректно закрывает открытую статью.
  useEffect(() => {
    if (initialArticleId) openArticle(initialArticleId);
    else setCurrent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArticleId]);

  async function saveArticle(payload: { id?: string; title: string; category: KbCategoryId; excerpt: string; content: string; attachments: KbAttachment[]; visibility: KbVisibility; allowedUserIds: number[] }) {
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
    onBack();
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
        authors={authors}
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
        onBack={() => { setCurrent(null); onBack(); }}
        onEdit={() => setEditing(current)}
        onDelete={() => deleteArticle(current.id)}
        onToggleFavorite={() => toggleFavorite(current.id)}
        canEdit={can('kb_edit')}
        canDelete={isAdmin}
      />
    );
  }

  return (
    <ArticleList
      list={list}
      filtered={filtered}
      loading={loading}
      search={search}
      setSearch={setSearch}
      favoritesOnly={favoritesOnly}
      setFavoritesOnly={setFavoritesOnly}
      can={can}
      onCreate={() => setEditing('new')}
      onOpen={onOpenArticleById}
      onToggleFavorite={toggleFavorite}
      authorName={authorName}
    />
  );
}