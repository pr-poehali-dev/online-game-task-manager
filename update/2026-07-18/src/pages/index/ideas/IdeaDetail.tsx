import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import AttachmentsField, { AttachmentsList, type Attachment } from '@/components/AttachmentsField';
import { IDEAS_URL, authHeaders } from '../shared';
import { statusMeta, fmtDate } from './shared';
import type { TopicListItem, IdeaComment } from './shared';
import IdeaComments from './IdeaComments';

export default function IdeaDetail({
  current,
  comments,
  authorName,
  authorPhoto,
  mentionMembers,
  currentUserId,
  isAdmin,
  canManage,
  onBack,
  onSetStatus,
  onDeleteTopic,
  editingTopic,
  setEditingTopic,
  editBody,
  setEditBody,
  editAttachments,
  setEditAttachments,
  uploadImage,
  onSaveTopicEdit,
  onReply,
  onDeleteComment,
  replyTo,
  setReplyTo,
  newComment,
  setNewComment,
  newCommentAttachments,
  setNewCommentAttachments,
  onAddComment,
}: {
  current: TopicListItem;
  comments: IdeaComment[];
  authorName: (id: number | null) => string;
  authorPhoto: (id: number | null) => string | null;
  mentionMembers: { id: number; name: string }[];
  currentUserId: number | undefined | null;
  isAdmin: boolean;
  canManage: boolean;
  onBack: () => void;
  onSetStatus: (status: 'open' | 'wont_do' | 'sent') => void;
  onDeleteTopic: () => void;
  editingTopic: boolean;
  setEditingTopic: (v: boolean) => void;
  editBody: string;
  setEditBody: (v: string) => void;
  editAttachments: Attachment[];
  setEditAttachments: (a: Attachment[]) => void;
  uploadImage: (file: File) => Promise<string>;
  onSaveTopicEdit: () => void;
  onReply: (c: IdeaComment) => void;
  onDeleteComment: (id: string) => void;
  replyTo: IdeaComment | null;
  setReplyTo: (c: IdeaComment | null) => void;
  newComment: string;
  setNewComment: (v: string) => void;
  newCommentAttachments: Attachment[];
  setNewCommentAttachments: (a: Attachment[]) => void;
  onAddComment: () => void;
}) {
  const sm = statusMeta[current.status];
  return (
    <div className="max-w-2xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          К списку
        </button>
        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            {!editingTopic && (
              <button
                onClick={() => { setEditBody(current.body); setEditAttachments(current.attachments ?? []); setEditingTopic(true); }}
                className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
              >
                <Icon name="Pencil" size={13} />
                Редактировать
              </button>
            )}
            {current.status !== 'open' && (
              <button onClick={() => onSetStatus('open')} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
                <Icon name="RotateCcw" size={13} />
                Переоткрыть
              </button>
            )}
            {current.status === 'open' && (
              <>
                <button onClick={() => onSetStatus('sent')} className="h-8 px-3 rounded-lg border text-xs transition-colors flex items-center gap-1.5" style={{ borderColor: 'hsl(152 55% 45% / 0.5)', color: 'hsl(152 55% 55%)', background: 'hsl(152 55% 45% / 0.1)' }}>
                  <Icon name="Rocket" size={13} />
                  На реализацию
                </button>
                <button onClick={() => onSetStatus('wont_do')} className="h-8 px-3 rounded-lg border text-xs transition-colors flex items-center gap-1.5" style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 62%)', background: 'hsl(0 65% 55% / 0.1)' }}>
                  <Icon name="XCircle" size={13} />
                  Не делать
                </button>
              </>
            )}
            <button onClick={onDeleteTopic} title="Удалить" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center">
              <Icon name="Trash2" size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 mb-5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ background: `hsl(${sm.color} / 0.15)`, color: `hsl(${sm.color})` }}>
          <Icon name={sm.icon} size={12} />
          {sm.label}
        </span>
        <h1 className="text-xl font-bold mt-3 mb-2 leading-tight">{current.title}</h1>
        <div className="text-xs text-muted-foreground mb-4 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Icon name="User" size={12} />{authorName(current.authorId)}</span>
          <span className="flex items-center gap-1"><Icon name="Clock" size={12} />{fmtDate(current.createdAt)}</span>
        </div>

        {editingTopic ? (
          <div className="space-y-3">
            <RichEditor content={editBody} onChange={setEditBody} onImageUpload={uploadImage} />
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Вложения</label>
              <AttachmentsField attachments={editAttachments} onChange={setEditAttachments} uploadUrl={IDEAS_URL} authHeaders={authHeaders} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onSaveTopicEdit} className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                Сохранить
              </button>
              <button onClick={() => setEditingTopic(false)} className="h-8 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <>
            {current.body && <div className="kb-content prose-invert text-sm" dangerouslySetInnerHTML={{ __html: current.body }} />}
            {!!current.attachments?.length && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Icon name="Paperclip" size={12} />
                  Вложения ({current.attachments.length})
                </div>
                <AttachmentsList attachments={current.attachments} />
              </div>
            )}
          </>
        )}
      </div>

      <IdeaComments
        comments={comments}
        authorName={authorName}
        authorPhoto={authorPhoto}
        mentionMembers={mentionMembers}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onReply={onReply}
        onDelete={onDeleteComment}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        newComment={newComment}
        setNewComment={setNewComment}
        newAttachments={newCommentAttachments}
        setNewAttachments={setNewCommentAttachments}
        onSubmit={onAddComment}
      />
    </div>
  );
}