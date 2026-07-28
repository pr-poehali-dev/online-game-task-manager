import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { ModalOverlay } from './shared';
import type { ServerId } from './shared';
import { postJson } from './patchesApi';
import type { SearchResult, FieldDef, RowValue, Mode } from './patchesDdfShared';
import { cleanText } from './patchesDdfShared';
import PatchesDdfSearchPanel from './PatchesDdfSearchPanel';
import PatchesDdfViewPanel from './PatchesDdfViewPanel';
import PatchesDdfCreatePanel from './PatchesDdfCreatePanel';
import PatchesDdfBulkPanel from './PatchesDdfBulkPanel';
import PatchesDdfRawPanel from './PatchesDdfRawPanel';

export default function PatchesDdfEditor({
  server,
  path,
  canManage,
  onClose,
}: {
  server: ServerId;
  path: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('search');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isRawOnlySchema, setIsRawOnlySchema] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [row, setRow] = useState<Record<string, RowValue> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawLine, setRawLine] = useState<string | null>(null);
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [createFields, setCreateFields] = useState<FieldDef[]>([]);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [bulkFields, setBulkFields] = useState<FieldDef[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkAdded, setBulkAdded] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setSearchError('');
    try {
      const data = await postJson({ action: 'ddf_search', server, path, query: q, limit: 50 });
      setResults(data.results || []);
      setTotalRows(data.totalRows || 0);
      setIsRawOnlySchema(!!data.isRawOnly);
    } catch {
      setSearchError('Не удалось выполнить поиск');
    } finally {
      setSearching(false);
    }
  }, [server, path]);

  useEffect(() => {
    runSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'search') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch, mode]);

  async function openRow(index: number) {
    setSelectedIndex(index);
    setLoadingRow(true);
    setSaveError('');
    setSaved(false);
    setConfirmDelete(false);
    try {
      const data = await postJson({ action: 'ddf_get', server, path, index });
      if (data.isRawOnly) {
        setIsRawMode(true);
        setMode('raw');
        const rawData = await postJson({ action: 'ddf_get_raw', server, path, index });
        setRawLine(rawData.line ?? '');
      } else {
        setIsRawMode(false);
        setMode('view');
        setFields(data.fields || []);
        setRow(data.row || {});
        const initialEdits: Record<string, string> = {};
        for (const f of data.fields || []) {
          if (f.editable) initialEdits[f.name] = cleanText(data.row?.[f.name]);
        }
        setEdits(initialEdits);
      }
    } catch {
      setSaveError('Не удалось загрузить запись');
    } finally {
      setLoadingRow(false);
    }
  }

  async function handleSave() {
    if (selectedIndex === null) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      if (isRawMode) {
        await postJson({ action: 'ddf_save_raw', server, path, index: selectedIndex, line: rawLine });
      } else {
        await postJson({ action: 'ddf_save', server, path, index: selectedIndex, edits });
        const firstEditableField = fields.find((f) => f.editable)?.name;
        const newPreview = firstEditableField ? edits[firstEditableField] : undefined;
        setResults((prev) => prev.map((r) => (
          r.index === selectedIndex
            ? { ...r, preview: newPreview || r.preview }
            : r
        )));
      }
      setSaved(true);
    } catch {
      setSaveError('Не удалось сохранить — проверьте формат строки и попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedIndex === null) return;
    setDeleting(true);
    try {
      await postJson({ action: 'ddf_delete', server, path, index: selectedIndex });
      setResults((prev) => prev.filter((r) => r.index !== selectedIndex));
      setTotalRows((prev) => Math.max(0, prev - 1));
      backToSearch();
      runSearch(query);
    } catch {
      setSaveError('Не удалось удалить запись');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  function backToSearch() {
    setMode('search');
    setSelectedIndex(null);
    setRow(null);
    setFields([]);
    setEdits({});
    setIsRawMode(false);
    setRawLine(null);
    setSaveError('');
    setSaved(false);
    setConfirmDelete(false);
  }

  async function openCreate() {
    setMode('create');
    setLoadingCreate(true);
    setCreateError('');
    try {
      const data = await postJson({ action: 'ddf_new', server, path });
      const flds: FieldDef[] = data.fields || [];
      setCreateFields(flds);
      const initial: Record<string, string> = {};
      for (const f of flds) {
        if (f.array) continue;
        initial[f.name] = cleanText(data.row?.[f.name]);
      }
      setCreateValues(initial);
    } catch {
      setCreateError('Не удалось загрузить форму создания');
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleCreateSubmit() {
    setCreating(true);
    setCreateError('');
    try {
      const rowPayload: Record<string, string> = {};
      for (const f of createFields) {
        if (f.array) continue;
        rowPayload[f.name] = createValues[f.name] ?? '';
      }
      await postJson({ action: 'ddf_create', server, path, rows: [rowPayload] });
      setMode('search');
      setQuery('');
      await runSearch('');
    } catch {
      setCreateError('Не удалось создать запись — проверьте значения полей');
    } finally {
      setCreating(false);
    }
  }

  async function openBulk() {
    setMode('bulk');
    setLoadingBulk(true);
    setBulkError('');
    setBulkAdded(null);
    setBulkText('');
    try {
      const data = await postJson({ action: 'ddf_new', server, path });
      setBulkFields(data.fields || []);
    } catch {
      setBulkError('Не удалось загрузить схему файла');
    } finally {
      setLoadingBulk(false);
    }
  }

  const bulkIdField = bulkFields.find((f) => !f.array && !f.editable)?.name;
  const bulkEditableFields = bulkFields.filter((f) => f.editable).map((f) => f.name);

  async function handleBulkSubmit() {
    if (!bulkIdField) return;
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
      const hasTab = bulkText.includes('\t');
      const rows = lines.map((line) => {
        const parts = (hasTab ? line.split('\t') : line.split(',')).map((p) => p.trim());
        const rowPayload: Record<string, string> = { [bulkIdField]: parts[0] ?? '' };
        bulkEditableFields.forEach((name, i) => {
          rowPayload[name] = parts[i + 1] ?? '';
        });
        return rowPayload;
      });
      const data = await postJson({ action: 'ddf_create', server, path, rows });
      setBulkAdded(data.added || rows.length);
      setBulkText('');
      runSearch(query);
    } catch {
      setBulkError('Не удалось добавить записи — проверьте формат и попробуйте ещё раз');
    } finally {
      setSubmittingBulk(false);
    }
  }

  const fileName = path.split('/').pop() || path;

  return (
    <ModalOverlay onClose={onClose} wide>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {mode !== 'search' && (
            <button
              onClick={backToSearch}
              className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Назад к поиску"
            >
              <Icon name="ChevronLeft" size={16} />
            </button>
          )}
          <Icon name="FileText" size={16} className="text-primary shrink-0" />
          <h3 className="font-display tracking-wide text-base truncate">{fileName}</h3>
          {totalRows > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">· {totalRows} записей</span>
          )}
        </div>
        <button onClick={onClose} className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Icon name="X" size={16} />
        </button>
      </div>

      {mode === 'search' && (
        <PatchesDdfSearchPanel
          query={query}
          setQuery={setQuery}
          searching={searching}
          searchError={searchError}
          results={results}
          canManage={canManage}
          isRawOnly={isRawOnlySchema}
          onOpenRow={openRow}
          onOpenCreate={openCreate}
          onOpenBulk={openBulk}
        />
      )}

      {mode === 'view' && (
        <PatchesDdfViewPanel
          loadingRow={loadingRow}
          row={row}
          fields={fields}
          edits={edits}
          setEdits={setEdits}
          canManage={canManage}
          saving={saving}
          saved={saved}
          saveError={saveError}
          onSave={handleSave}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          deleting={deleting}
          onDelete={handleDelete}
        />
      )}

      {mode === 'raw' && (
        <PatchesDdfRawPanel
          loadingRow={loadingRow}
          line={rawLine}
          setLine={setRawLine}
          canManage={canManage}
          saving={saving}
          saved={saved}
          saveError={saveError}
          onSave={handleSave}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          deleting={deleting}
          onDelete={handleDelete}
        />
      )}

      {mode === 'create' && (
        <PatchesDdfCreatePanel
          loadingCreate={loadingCreate}
          createFields={createFields}
          createValues={createValues}
          setCreateValues={setCreateValues}
          creating={creating}
          createError={createError}
          onSubmit={handleCreateSubmit}
        />
      )}

      {mode === 'bulk' && (
        <PatchesDdfBulkPanel
          loadingBulk={loadingBulk}
          bulkIdField={bulkIdField}
          bulkEditableFields={bulkEditableFields}
          bulkText={bulkText}
          setBulkText={setBulkText}
          submittingBulk={submittingBulk}
          bulkAdded={bulkAdded}
          bulkError={bulkError}
          onSubmit={handleBulkSubmit}
        />
      )}
    </ModalOverlay>
  );
}