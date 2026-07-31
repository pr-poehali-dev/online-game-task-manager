import { useState, useEffect, useCallback } from 'react';
import { TASKS_URL, authHeaders } from './shared';
import { privateNotesCache } from './taskDataCache';

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
  // Первичное значение — из кеша (если задачу уже открывали в этой сессии), чтобы повторное
  // открытие карточки задачи не показывало пустой список на время фонового fetch (см.
  // taskDataCache.ts за подробностями).
  const [notes, setNotes] = useState<PrivateNote[]>(() => privateNotesCache.get(taskId) ?? []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(TASKS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'private_notes', taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        const loaded = data.notes || [];
        privateNotesCache.set(taskId, loaded);
        setNotes(loaded);
      }
    } catch {
      /* ignore */
    }
  }, [taskId]);

  useEffect(() => {
    // Если для этой задачи уже есть кеш — не блокируем интерфейс повторным запросом: данные уже
    // показаны из кеша выше, обновление в фоне (на случай изменений другими участниками) не критично.
    if (!privateNotesCache.has(taskId)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

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
        setNotes((prev) => {
          const next = [...prev, data.note];
          privateNotesCache.set(taskId, next);
          return next;
        });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function removeNote(id: string) {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      privateNotesCache.set(taskId, next);
      return next;
    });
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