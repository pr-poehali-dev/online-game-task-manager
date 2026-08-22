import { useCallback, useEffect, useState } from 'react';
import { AI_URL, authHeaders } from './shared';

// Один файл сотрудника из персонального реестра (backend/ai/userfiles.py, таблица ai_files).
export interface AiUserFile {
  id: number;
  name: string;
  url: string;
  size: number;
  contentType: string;
  kind: 'upload' | 'template' | 'image' | 'video' | 'document';
  group: string;
  chatId: number | null;
  createdAt: string | null;
}

export interface AiFilesState {
  files: AiUserFile[];
  totalSize: number;
  usedFiles: number;
  limitFiles: number;
  loading: boolean;
  busyId: number | null;
  clearing: boolean;
  load: () => Promise<void>;
  deleteFile: (id: number) => Promise<void>;
  clearFiles: (kind?: string) => Promise<void>;
}

// useAiFiles — состояние раздела "Мои файлы": список файлов сотрудника, расход личного лимита и
// самостоятельная очистка (по одному файлу или целой группой). Лимит на количество файлов задаёт
// администратор в разделе "Команда" (users.ai_file_limit).
export function useAiFiles(enabled: boolean): AiFilesState {
  const [files, setFiles] = useState<AiUserFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [usedFiles, setUsedFiles] = useState(0);
  const [limitFiles, setLimitFiles] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=list_files`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFiles(data.files || []);
        setTotalSize(data.totalSize || 0);
        setUsedFiles(data.usedFiles || 0);
        setLimitFiles(data.limitFiles || 0);
      }
    } catch {
      /* ignore — список просто останется прежним, повторить можно кнопкой обновления */
    } finally {
      setLoading(false);
    }
  }, []);

  // Грузим только когда панель реально открыта: сотрудник может ни разу не заглянуть в свои файлы
  // за сессию, а лишний запрос при каждом входе в раздел "AI" не нужен.
  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const deleteFile = useCallback(async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete_file', fileId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        setUsedFiles(data.usedFiles ?? 0);
        setLimitFiles(data.limitFiles ?? 0);
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  }, []);

  const clearFiles = useCallback(async (kind?: string) => {
    setClearing(true);
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(kind ? { action: 'clear_files', kind } : { action: 'clear_files' }),
      });
      if (res.ok) await load();
    } catch {
      /* ignore */
    } finally {
      setClearing(false);
    }
  }, [load]);

  return { files, totalSize, usedFiles, limitFiles, loading, busyId, clearing, load, deleteFile, clearFiles };
}
