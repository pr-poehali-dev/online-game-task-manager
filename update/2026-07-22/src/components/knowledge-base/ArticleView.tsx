import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CatBadge from './CatBadge';
import { fmtSize, fileIconFor, fmtDate } from './shared';
import type { Article } from './shared';

export default function ArticleView({ article, authorName, onBack, onEdit, onDelete, onToggleFavorite, canEdit, canDelete }: {
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
    <div className="max-w-5xl animate-fade-in">
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
        <div className="flex items-center gap-2">
          <CatBadge id={article.category} />
          {article.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">
              <Icon name="Lock" size={10} />
              Приватная
            </span>
          )}
        </div>
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