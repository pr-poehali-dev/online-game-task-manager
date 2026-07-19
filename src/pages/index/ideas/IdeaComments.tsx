import Icon from '@/components/ui/icon';
import AttachmentsField, { AttachmentsList, type Attachment } from '@/components/AttachmentsField';
import MentionInput from '../MentionInput';
import { IDEAS_URL, authHeaders } from '../shared';
import { initialsFor, renderText, fmtDate } from './shared';
import type { IdeaComment } from './shared';

export function CommentItem({
  comment,
  isReply = false,
  authorName,
  authorPhoto,
  mentionNames,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: IdeaComment;
  isReply?: boolean;
  authorName: (id: number | null) => string;
  authorPhoto: (id: number | null) => string | null;
  mentionNames: string[];
  canDelete: boolean;
  onReply: (c: IdeaComment) => void;
  onDelete: (id: string) => void;
}) {
  const photo = authorPhoto(comment.authorId);
  const name = authorName(comment.authorId);
  return (
    <div className="flex gap-2.5 group">
      {photo ? (
        <img src={photo} alt="" className={`rounded-md object-cover shrink-0 mt-0.5 ${isReply ? 'h-7 w-7' : 'h-8 w-8'}`} />
      ) : (
        <div className={`rounded-md bg-secondary flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 text-muted-foreground ${isReply ? 'h-7 w-7' : 'h-8 w-8'}`}>
          {initialsFor(name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(comment.createdAt)}</span>
          <button
            onClick={() => onReply(comment)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
          >
            <Icon name="CornerDownRight" size={11} /> Ответить
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              title="Удалить комментарий"
            >
              <Icon name="Trash2" size={12} />
            </button>
          )}
        </div>
        {comment.text && (
          <div className="text-sm bg-secondary/40 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{renderText(comment.text, mentionNames)}</div>
        )}
        {!!comment.attachments?.length && (
          <div className={comment.text ? 'mt-1.5' : ''}>
            <AttachmentsList attachments={comment.attachments} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function IdeaComments({
  comments,
  authorName,
  authorPhoto,
  mentionMembers,
  currentUserId,
  isAdmin,
  onReply,
  onDelete,
  replyTo,
  setReplyTo,
  newComment,
  setNewComment,
  newAttachments,
  setNewAttachments,
  onSubmit,
}: {
  comments: IdeaComment[];
  authorName: (id: number | null) => string;
  authorPhoto: (id: number | null) => string | null;
  mentionMembers: { id: number; name: string }[];
  currentUserId: number | undefined | null;
  isAdmin: boolean;
  onReply: (c: IdeaComment) => void;
  onDelete: (id: string) => void;
  replyTo: IdeaComment | null;
  setReplyTo: (c: IdeaComment | null) => void;
  newComment: string;
  setNewComment: (v: string) => void;
  newAttachments: Attachment[];
  setNewAttachments: (a: Attachment[]) => void;
  onSubmit: () => void;
}) {
  const topLevel = comments.filter((c) => !c.parentId);
  const mentionNames = mentionMembers.map((m) => m.name);

  return (
    <>
      <div className="mb-3 text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Icon name="MessageSquare" size={15} />
        Обсуждение {comments.length > 0 && <span className="font-mono">({comments.length})</span>}
      </div>

      <div className="space-y-3 mb-4">
        {topLevel.map((c) => {
          const replies = comments.filter((r) => r.parentId === c.id);
          const canDelete = !!currentUserId && (c.authorId === currentUserId || isAdmin);
          return (
            <div key={c.id}>
              <CommentItem
                comment={c}
                authorName={authorName}
                authorPhoto={authorPhoto}
                mentionNames={mentionNames}
                canDelete={canDelete}
                onReply={onReply}
                onDelete={onDelete}
              />
              {replies.length > 0 && (
                <div className="ml-9 mt-2 space-y-2 border-l-2 border-border/60 pl-3">
                  {replies.map((r) => {
                    const replyCanDelete = !!currentUserId && (r.authorId === currentUserId || isAdmin);
                    return (
                      <div key={r.id}>
                        <CommentItem
                          comment={r}
                          isReply
                          authorName={authorName}
                          authorPhoto={authorPhoto}
                          mentionNames={mentionNames}
                          canDelete={replyCanDelete}
                          onReply={onReply}
                          onDelete={onDelete}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {comments.length === 0 && <div className="text-sm text-muted-foreground">Комментариев пока нет — начните обсуждение.</div>}
      </div>

      <div>
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-1.5 mb-2">
            <Icon name="CornerDownRight" size={13} className="text-primary" />
            Ответ для <span className="font-medium text-foreground">{authorName(replyTo.authorId)}</span>
            <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-foreground">
              <Icon name="X" size={13} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/60 focus-within:ring-1 focus-within:ring-primary">
            <MentionInput
              value={newComment}
              onChange={setNewComment}
              members={mentionMembers}
              onSubmit={onSubmit}
              placeholder="Написать комментарий. @ — упомянуть. Ctrl+Enter — отправить"
              className="w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <AttachmentsField attachments={newAttachments} onChange={setNewAttachments} uploadUrl={IDEAS_URL} authHeaders={authHeaders} action="comment_upload_file" compact />
          </div>
          <button
            onClick={onSubmit}
            disabled={!newComment.trim() && !newAttachments.length}
            className="h-9 self-start px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40 transition-colors shrink-0"
          >
            <Icon name="Send" size={15} />
          </button>
        </div>
      </div>
    </>
  );
}