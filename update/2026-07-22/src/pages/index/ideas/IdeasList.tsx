import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import AttachmentsField, { type Attachment } from '@/components/AttachmentsField';
import { IDEAS_URL, authHeaders } from '../shared';
import { statusMeta, fmtDate } from './shared';
import type { TopicListItem } from './shared';

export function CreateTopic({
  newTitle,
  setNewTitle,
  newBody,
  setNewBody,
  newAttachments,
  setNewAttachments,
  uploadImage,
  onCancel,
  onCreate,
}: {
  newTitle: string;
  setNewTitle: (v: string) => void;
  newBody: string;
  setNewBody: (v: string) => void;
  newAttachments: Attachment[];
  setNewAttachments: (a: Attachment[]) => void;
  uploadImage: (file: File) => Promise<string>;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          Отмена
        </button>
        <h2 className="font-display tracking-wide text-lg">Новая идея</h2>
        <button
          onClick={onCreate}
          disabled={!newTitle.trim()}
          className="ml-auto h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Опубликовать
        </button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="О чём идея? Кратко..."
          className="w-full bg-transparent text-xl font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1.5 transition-colors placeholder:text-muted-foreground/50"
        />
        <RichEditor
          content={newBody}
          onChange={setNewBody}
          onImageUpload={uploadImage}
          placeholder="Опишите мысль подробнее: что предлагаете, зачем, какие плюсы и риски..."
        />
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Вложения</label>
          <AttachmentsField attachments={newAttachments} onChange={setNewAttachments} uploadUrl={IDEAS_URL} authHeaders={authHeaders} />
        </div>
      </div>
    </div>
  );
}

export default function IdeasList({
  list,
  loading,
  can,
  onCreateClick,
  onOpenTopic,
  authorName,
}: {
  list: TopicListItem[];
  loading: boolean;
  can: (key: 'idea_create') => boolean;
  onCreateClick: () => void;
  onOpenTopic: (id: string) => void;
  authorName: (id: number | null) => string;
}) {
  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="Lightbulb" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">Идеи</h2>
        <span className="text-sm text-muted-foreground">· {list.length} тем</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Предложения и размышления о том, что стоило бы сделать. Обсуждайте в комментариях, закрывайте решённые темы.</p>

      {can('idea_create') && (
        <div className="flex justify-end mb-4">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Icon name="Plus" size={15} />
            Новая идея
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={26} className="animate-spin text-primary" />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Lightbulb" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Пока нет ни одной идеи — предложите первую</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((t) => {
            const sm = statusMeta[t.status];
            return (
              <button
                key={t.id}
                onClick={() => onOpenTopic(t.id)}
                className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/50 transition-all group flex items-center gap-3"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md shrink-0" style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}>
                  <Icon name={sm.icon} size={12} />
                  <span className="hidden sm:inline">{sm.label}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{authorName(t.authorId)} · {fmtDate(t.updatedAt)}</div>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Icon name="MessageSquare" size={12} />
                  {t.commentsCount}
                </span>
                <Icon name="ChevronRight" size={15} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}