import { useState } from 'react';
import { postJson } from './patchesApi';
import type { FieldDef, Mode, RawColumn } from './patchesDdfShared';
import type { ServerId } from './shared';

export function useDdfBulk(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  query: string,
  runSearch: (q: string) => Promise<void>,
  isRawOnlySchema: boolean,
) {
  const [bulkFields, setBulkFields] = useState<FieldDef[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkTemplateLine, setBulkTemplateLine] = useState('');
  const [bulkRawColumns, setBulkRawColumns] = useState<RawColumn[]>([]);
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkAdded, setBulkAdded] = useState<number | null>(null);

  async function openBulk() {
    setMode('bulk');
    setLoadingBulk(true);
    setBulkError('');
    setBulkAdded(null);
    setBulkText('');
    try {
      const data = await postJson({ action: 'ddf_new', server, path });
      if (data.isRawOnly) {
        // Шаблонная строка используется как подсказка/заготовка формата — каждая строка списка
        // должна иметь ровно столько же таб-разделённых значений, в том же порядке.
        setBulkTemplateLine(data.rawLine ?? '');
        setBulkRawColumns(data.rawColumns || []);
        setBulkFields([]);
      } else {
        setBulkFields(data.fields || []);
      }
    } catch {
      setBulkError('Не удалось загрузить схему файла');
    } finally {
      setLoadingBulk(false);
    }
  }

  const bulkIdField = bulkFields.find((f) => !f.array && !f.editable)?.name;
  const bulkEditableFields = bulkFields.filter((f) => f.editable).map((f) => f.name);

  async function handleBulkSubmit() {
    if (!isRawOnlySchema && !bulkIdField) return;
    setSubmittingBulk(true);
    setBulkError('');
    setBulkAdded(null);
    try {
      const lines = bulkText.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setBulkError('Вставьте хотя бы одну строку');
        setSubmittingBulk(false);
        return;
      }
      let data;
      if (isRawOnlySchema) {
        // Каждая строка — уже готовая taб-разделённая запись целиком (пользователь копирует и
        // правит несколько копий шаблонной строки) — отправляем как есть, без разбора на поля.
        data = await postJson({ action: 'ddf_create', server, path, rawLines: lines });
      } else {
        const hasTab = bulkText.includes('\t');
        const rows = lines.map((line) => {
          const parts = (hasTab ? line.split('\t') : line.split(',')).map((p) => p.trim());
          const rowPayload: Record<string, string> = { [bulkIdField!]: parts[0] ?? '' };
          bulkEditableFields.forEach((name, i) => {
            rowPayload[name] = parts[i + 1] ?? '';
          });
          return rowPayload;
        });
        data = await postJson({ action: 'ddf_create', server, path, rows });
      }
      setBulkAdded(data.added || lines.length);
      setBulkText('');
      runSearch(query);
    } catch {
      setBulkError('Не удалось добавить записи — проверьте формат и попробуйте ещё раз');
    } finally {
      setSubmittingBulk(false);
    }
  }

  return {
    bulkFields,
    bulkText,
    setBulkText,
    bulkTemplateLine,
    bulkRawColumns,
    loadingBulk,
    submittingBulk,
    bulkError,
    bulkAdded,
    bulkIdField,
    bulkEditableFields,
    openBulk,
    handleBulkSubmit,
  };
}
