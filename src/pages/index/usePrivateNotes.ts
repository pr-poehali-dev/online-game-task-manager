import { useState, useEffect, useCallback } from 'react';
import { TASKS_URL, authHeaders } from './shared';

export interface PrivateNote {
  id: string;
  taskId: string;
  commentId: string | null;
  authorId: number;
  targetUserId: number;
  text: string;
  createdAt: string | null;
}

export default function usePrivateNotes(taskId: string) {
  const [notes, setNotes] = useState<PrivateNote[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'private_notes', taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {
      /* ignore */
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  async function addNote(targetUserId: number, text: string, commentId: string | null = null): Promise<boolean> {
    if (!text.trim() || !targetUserId) return false;
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'private_note_add', taskId, targetUserId, text: text.trim(), commentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [...prev, data.note]);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'private_note_delete', id }),
      });
    } catch {
      /* ignore */
    }
  }

  return { notes, addNote, removeNote };
}
