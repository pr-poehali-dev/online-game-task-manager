import { useState, useEffect, useCallback } from 'react';
import type { Attachment } from '@/components/AttachmentsField';
import { useAuth } from '@/lib/auth';
import { IDEAS_URL, authHeaders } from './shared';
import { extractMentions } from './MentionInput';
import IdeasList, { CreateTopic } from './ideas/IdeasList';
import IdeaDetail from './ideas/IdeaDetail';
import type { Author, TopicListItem, IdeaComment, IdeaStatus } from './ideas/shared';

export default function Ideas({ authors, initialTopicId, onConsumeInitial }: {
  authors: Author[];
  initialTopicId?: string | null;
  onConsumeInitial?: () => void;
}) {
  const { user, isAdmin, can } = useAuth();
  const [list, setList] = useState<TopicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<TopicListItem | null>(null);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCommentAttachments, setNewCommentAttachments] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<IdeaComment | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [editAttachments, setEditAttachments] = useState<Attachment[]>([]);

  const mentionMembers = authors.map((a) => ({ id: a.id, name: a.name }));
  const authorName = (id: number | null) => (id != null ? authors.find((a) => a.id === id)?.name ?? 'Участник' : 'Участник');
  const authorPhoto = (id: number | null) => (id != null ? authors.find((a) => a.id === id)?.photo_url ?? null : null);
  const canManage = (t: TopicListItem) => !!user && (t.authorId === user.id || isAdmin);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(IDEAS_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setList(data.topics || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openTopic = useCallback(async (id: string) => {
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'get', id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.topic) {
          setCurrent(data.topic);
          setComments(data.comments || []);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (initialTopicId) {
      openTopic(initialTopicId);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopicId]);

  async function uploadImage(file: File): Promise<string> {
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const res = await fetch(IDEAS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'upload_image', data: dataUrl, ext, contentType: file.type }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.url || '';
  }

  async function createTopic() {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', title: newTitle.trim(), body: newBody, attachments: newAttachments }),
      });
      if (res.ok) {
        setCreating(false);
        setNewTitle('');
        setNewBody('');
        setNewAttachments([]);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function saveTopicEdit() {
    if (!current) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'update', id: current.id, title: current.title, body: editBody, attachments: editAttachments }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrent(data.topic);
        setEditingTopic(false);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function addComment() {
    if ((!newComment.trim() && newCommentAttachments.length === 0) || !current) return;
    const mentions = extractMentions(newComment, mentionMembers);
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comment', topicId: current.id, text: newComment.trim(), parentId: (replyTo?.parentId ?? replyTo?.id) ?? null, mentions, attachments: newCommentAttachments }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
        setNewCommentAttachments([]);
        setReplyTo(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    try {
      await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'comment_delete', id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function setStatus(status: IdeaStatus) {
    if (!current) return;
    try {
      const res = await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'set_status', id: current.id, status }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrent(data.topic);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteTopic() {
    if (!current) return;
    try {
      await fetch(IDEAS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id: current.id }),
      });
    } catch {
      /* ignore */
    }
    setCurrent(null);
    loadList();
  }

  // Создание топика
  if (creating) {
    return (
      <CreateTopic
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newBody={newBody}
        setNewBody={setNewBody}
        newAttachments={newAttachments}
        setNewAttachments={setNewAttachments}
        uploadImage={uploadImage}
        onCancel={() => setCreating(false)}
        onCreate={createTopic}
      />
    );
  }

  // Просмотр топика
  if (current) {
    return (
      <IdeaDetail
        current={current}
        comments={comments}
        authorName={authorName}
        authorPhoto={authorPhoto}
        mentionMembers={mentionMembers}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        canManage={canManage(current)}
        onBack={() => setCurrent(null)}
        onSetStatus={setStatus}
        onDeleteTopic={deleteTopic}
        editingTopic={editingTopic}
        setEditingTopic={setEditingTopic}
        editBody={editBody}
        setEditBody={setEditBody}
        editAttachments={editAttachments}
        setEditAttachments={setEditAttachments}
        uploadImage={uploadImage}
        onSaveTopicEdit={saveTopicEdit}
        onReply={setReplyTo}
        onDeleteComment={deleteComment}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        newComment={newComment}
        setNewComment={setNewComment}
        newCommentAttachments={newCommentAttachments}
        setNewCommentAttachments={setNewCommentAttachments}
        onAddComment={addComment}
      />
    );
  }

  // Список топиков
  return (
    <IdeasList
      list={list}
      loading={loading}
      can={can}
      onCreateClick={() => setCreating(true)}
      onOpenTopic={openTopic}
      authorName={authorName}
    />
  );
}