import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import AttachmentsField, { AttachmentsList, type Attachment } from '@/components/AttachmentsField';
import type { TeamMember } from './shared';
import { resolveAssignee, AssigneeAvatar, TASKS_URL, authHeaders } from './shared';
import MentionInput, { extractMentions } from './MentionInput';
import type { TaskComment } from './TaskModalShared';
import { renderMentionText } from './TaskModalShared';

export default function TaskComments({ taskId, team }: {
  taskId: string;
  team: TeamMember[];
}) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);

  const mentionMembers = team.map((m) => ({ id: m.id, name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}` }));
  const mentionNames = mentionMembers.map((m) => m.name);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comments', taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch {
      /* ignore */
    }
  }, [taskId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function addComment() {
    if (!newComment.trim() && newAttachments.length === 0) return;
    const mentions = extractMentions(newComment, mentionMembers);
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comment', taskId, text: newComment.trim(), parentId: (replyTo?.parentId ?? replyTo?.id) ?? null, mentions, attachments: newAttachments }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
        setNewAttachments([]);
        setReplyTo(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function removeComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comment_delete', id }),
      });
    } catch {
      /* ignore */
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);

  function renderComment(c: TaskComment, isReply = false) {
    const auth = resolveAssignee(team, c.authorId != null ? Number(c.authorId) : null);
    const canDel = !!user && (Number(c.authorId) === user.id || isAdmin);
    return (
      <div className="flex gap-2.5 group">
        <AssigneeAvatar a={auth} size={isReply ? 24 : 28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium">{auth.name}</span>
            <span className="text-xs text-muted-foreground">
              {c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            <button onClick={() => setReplyTo(c)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
              <Icon name="CornerDownRight" size={11} /> Ответить
            </button>
            {canDel && (
              <button
                onClick={() => removeComment(c.id)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-xs"
              >
                <Icon name="X" size={12} />
              </button>
            )}
          </div>
          {c.text && (
            <div className="text-sm bg-secondary/40 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{renderMentionText(c.text, mentionNames)}</div>
          )}
          {!!c.attachments?.length && (
            <div className={c.text ? 'mt-1.5' : ''}>
              <AttachmentsList attachments={c.attachments} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon name="MessageSquare" size={12} />
        Комментарии {comments.length > 0 && <span className="font-mono">({comments.length})</span>}
      </label>
      {topLevel.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {topLevel.map((c) => {
            const replies = comments.filter((r) => r.parentId === c.id);
            return (
              <div key={c.id}>
                {renderComment(c)}
                {replies.length > 0 && (
                  <div className="ml-9 mt-2 space-y-2 border-l-2 border-border/60 pl-3">
                    {replies.map((r) => <div key={r.id}>{renderComment(r, true)}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {replyTo && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-1.5 mb-2">
          <Icon name="CornerDownRight" size={13} className="text-primary" />
          Ответ для <span className="font-medium text-foreground">{resolveAssignee(team, replyTo.authorId != null ? Number(replyTo.authorId) : null).name}</span>
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
            onSubmit={addComment}
            placeholder="Написать комментарий. @ — упомянуть. Ctrl+Enter — отправить"
            className="w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <AttachmentsField attachments={newAttachments} onChange={setNewAttachments} uploadUrl={TASKS_URL} authHeaders={authHeaders} action="comment_upload_file" compact />
        </div>
        <button
          onClick={addComment}
          disabled={!newComment.trim() && !newAttachments.length}
          className="h-9 self-start px-3 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40 transition-colors shrink-0"
        >
          <Icon name="Send" size={15} />
        </button>
      </div>
    </div>
  );
}