import Icon from '@/components/ui/icon';
import CatBadge from './CatBadge';
import { inputCls, fmtDate } from './shared';
import type { ArticleListItem } from './shared';

export default function ArticleList({
  list,
  filtered,
  loading,
  search,
  setSearch,
  favoritesOnly,
  setFavoritesOnly,
  can,
  onCreate,
  onOpen,
  onToggleFavorite,
  authorName,
}: {
  list: ArticleListItem[];
  filtered: ArticleListItem[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  can: (key: 'kb_create') => boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  authorName: (id: number | null) => string;
}) {
  return (
    <div className="max-w-6xl animate-fade-in">
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
            onClick={onCreate}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((a) => (
            <div
              key={a.id}
              onClick={() => onOpen(a.id)}
              className="relative text-left rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2 pr-6">
                <div className="flex items-center gap-1.5">
                  <CatBadge id={a.category} />
                  {a.visibility === 'private' && (
                    <Icon name="Lock" size={11} className="text-muted-foreground" />
                  )}
                </div>
                <Icon name="ChevronRight" size={15} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(a.id); }}
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