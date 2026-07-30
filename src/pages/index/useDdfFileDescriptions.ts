import { useState, useCallback, useEffect } from 'react';
import { postJson } from './patchesApi';
import { normalizeKey } from './patchesFileDescriptions';

interface DescItem {
  nameKey: string;
  isFolder: boolean;
  description: string;
}

// Загружает и позволяет редактировать ПОЛЬЗОВАТЕЛЬСКИЕ описания файлов/папок клиента (переопределяют
// встроенный статический справочник patchesFileDescriptions.ts — см. describeFile/describeFolder).
// Просмотр (patch_desc_list) доступен любому авторизованному участнику — подсказки видят все.
// Редактирование (patch_desc_save/patch_desc_delete) backend разрешает ТОЛЬКО владельцу проекта
// (OWNER_USER_ID в backend/patches/index.py) — попытка сохранить от чужого имени вернёт 403,
// поэтому UI редактирования (см. PatchesTreeFolder.tsx) показывается только владельцу и на фронте,
// но настоящая защита — на backend, не полагаемся только на скрытие кнопки.
export function useDdfFileDescriptions() {
  // customFiles/customFolders — Record<normalizedKey, description> для быстрого O(1) поиска в
  // describeFile/describeFolder при рендере каждой строки дерева.
  const [customFiles, setCustomFiles] = useState<Record<string, string>>({});
  const [customFolders, setCustomFolders] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  // isOwner приходит с backend (единый источник истины — OWNER_USER_ID захардкожен только там),
  // а не сравнивается на фронте с user.id — чтобы не дублировать/рассинхронизировать константу.
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await postJson({ action: 'patch_desc_list' });
      const items: DescItem[] = data.items || [];
      const files: Record<string, string> = {};
      const folders: Record<string, string> = {};
      for (const item of items) {
        if (item.isFolder) folders[item.nameKey] = item.description;
        else files[item.nameKey] = item.description;
      }
      setCustomFiles(files);
      setCustomFolders(folders);
      setIsOwner(!!data.isOwner);
    } catch {
      /* ignore — подсказки не критичны, при ошибке просто останется встроенный справочник */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveDescription(rawName: string, isFolder: boolean, description: string) {
    const nameKey = isFolder ? rawName.toLowerCase() : normalizeKey(rawName);
    setSavingKey(nameKey);
    setSaveError('');
    try {
      await postJson({ action: 'patch_desc_save', nameKey, isFolder, description });
      if (isFolder) setCustomFolders((prev) => ({ ...prev, [nameKey]: description }));
      else setCustomFiles((prev) => ({ ...prev, [nameKey]: description }));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setSaveError(code === 'forbidden' ? 'Редактировать описания может только руководитель' : 'Не удалось сохранить описание');
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteDescription(rawName: string, isFolder: boolean) {
    const nameKey = isFolder ? rawName.toLowerCase() : normalizeKey(rawName);
    setSavingKey(nameKey);
    setSaveError('');
    try {
      await postJson({ action: 'patch_desc_delete', nameKey, isFolder });
      if (isFolder) setCustomFolders((prev) => { const next = { ...prev }; delete next[nameKey]; return next; });
      else setCustomFiles((prev) => { const next = { ...prev }; delete next[nameKey]; return next; });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setSaveError(code === 'forbidden' ? 'Редактировать описания может только руководитель' : 'Не удалось удалить описание');
    } finally {
      setSavingKey(null);
    }
  }

  return {
    customFiles,
    customFolders,
    loaded,
    savingKey,
    saveError,
    isOwner,
    saveDescription,
    deleteDescription,
  };
}