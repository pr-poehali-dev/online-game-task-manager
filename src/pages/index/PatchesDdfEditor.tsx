import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { ModalOverlay } from './shared';
import type { ServerId } from './shared';
import { postJson } from './patchesApi';

interface SearchResult {
  index: number;
  label: string;
  preview: string;
}

interface FieldDef {
  name: string;
  type: string;
  array: boolean;
  editable: boolean;
}

type RowValue = string | number | (string | number)[] | null;
type Mode = 'search' | 'view' | 'create' | 'bulk';

const NULL_CHAR = String.fromCharCode(0);

function cleanText(v: RowValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v).split(NULL_CHAR).join('');
}

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

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [row, setRow] = useState<Record<string, RowValue> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
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
    setMode('view');
    setSelectedIndex(index);
    setLoadingRow(true);
    setSaveError('');
    setSaved(false);
    setConfirmDelete(false);
    try {
      const data = await postJson({ action: 'ddf_get', server, path, index });
      setFields(data.fields || []);
      setRow(data.row || {});
      const initialEdits: Record<string, string> = {};
      for (const f of data.fields || []) {
        if (f.editable) initialEdits[f.name] = cleanText(data.row?.[f.name]);
      }
      setEdits(initialEdits);
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
      await postJson({ action: 'ddf_save', server, path, index: selectedIndex, edits });
      setSaved(true);
      const firstEditableField = fields.find((f) => f.editable)?.name;
      const newPreview = firstEditableField ? edits[firstEditableField] : undefined;
      setResults((prev) => prev.map((r) => (
        r.index === selectedIndex
          ? { ...r, preview: newPreview || r.preview }
          : r
      )));
    } catch {
      setSaveError('Не удалось сохранить — попробуйте ещё раз');
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
    setSaveError('');
    setSaved(false);
    setConfirmDelete(false);
  }

  async function openCreate() {
    setMode('create');
    setLoadingCreate(true);
    setCreateError('');
    try {
      const data = await postJson({ action: 'ddf_new', path });
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
      const data = await postJson({ action: 'ddf_new', path });
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
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию, описанию или ID..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
              />
              {searching && (
                <Icon name="Loader2" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>
            {canManage && (
              <>
                <button
                  onClick={openCreate}
                  title="Создать новую запись"
                  className="h-10 px-3 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Icon name="Plus" size={15} />
                  <span className="hidden sm:inline">Создать</span>
                </button>
                <button
                  onClick={openBulk}
                  title="Добавить несколько записей списком"
                  className="h-10 px-3 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Icon name="ListPlus" size={15} />
                  <span className="hidden sm:inline">Списком</span>
                </button>
              </>
            )}
          </div>

          {searchError && <p className="text-sm text-destructive mb-3">{searchError}</p>}

          <div className="max-h-[55vh] overflow-auto scrollbar-thin -mx-1 px-1">
            {results.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {query ? 'Ничего не найдено' : 'Начните вводить запрос или выберите запись из списка'}
              </p>
            )}
            {results.map((r) => (
              <button
                key={r.index}
                onClick={() => openRow(r.index)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors flex items-center gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.preview || '(пусто)'}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.label}</div>
                </div>
                <Icon name="ChevronRight" size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'view' && (
        <div className="p-5">
          {loadingRow ? (
            <div className="flex justify-center py-16">
              <Icon name="Loader2" size={24} className="animate-spin text-primary" />
            </div>
          ) : row ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border pb-3">
                {fields.filter((f) => !f.editable && !f.array).map((f) => (
                  <span key={f.name}>
                    <span className="opacity-70">{f.name}:</span> {cleanText(row[f.name])}
                  </span>
                ))}
              </div>

              {fields.filter((f) => f.editable).map((f) => (
                <div key={f.name}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.name}</label>
                  <textarea
                    value={edits[f.name] ?? ''}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    rows={edits[f.name]?.length > 80 ? 4 : 1}
                    disabled={!canManage}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y min-h-[38px] disabled:opacity-70"
                  />
                </div>
              ))}

              {fields.filter((f) => f.editable).length === 0 && (
                <p className="text-sm text-muted-foreground">В этой записи нет текстовых полей для редактирования.</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                {canManage && (
                  <button
                    onClick={handleSave}
                    disabled={saving || fields.filter((f) => f.editable).length === 0}
                    className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                  >
                    <Icon name={saving ? 'Loader2' : 'Save'} size={14} className={saving ? 'animate-spin' : ''} />
                    {saving ? 'Сохраняю...' : 'Сохранить'}
                  </button>
                )}
                {saved && (
                  <span className="text-sm text-emerald-500 flex items-center gap-1.5">
                    <Icon name="Check" size={14} /> Сохранено
                  </span>
                )}
                {saveError && <span className="text-sm text-destructive">{saveError}</span>}
                {canManage && (
                  <div className="ml-auto">
                    {confirmDelete ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Удалить запись?</span>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="h-8 px-3 rounded-md bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Удаляю...' : 'Да'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="h-8 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        title="Удалить эту запись"
                        className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">Не удалось загрузить запись</p>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className="p-5">
          {loadingCreate ? (
            <div className="flex justify-center py-16">
              <Icon name="Loader2" size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Заполните поля новой записи и сохраните — она добавится в конец файла.</p>
              <div className="grid grid-cols-2 gap-3">
                {createFields.filter((f) => !f.array && !f.editable).map((f) => (
                  <div key={f.name}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.name}</label>
                    <input
                      value={createValues[f.name] ?? ''}
                      onChange={(e) => setCreateValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                ))}
              </div>

              {createFields.filter((f) => f.editable).map((f) => (
                <div key={f.name}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.name}</label>
                  <textarea
                    value={createValues[f.name] ?? ''}
                    onChange={(e) => setCreateValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    rows={(createValues[f.name]?.length ?? 0) > 80 ? 4 : 1}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y min-h-[38px]"
                  />
                </div>
              ))}

              {createFields.some((f) => f.array) && (
                <p className="text-xs text-muted-foreground">
                  Табличные поля этой схемы будут заполнены значениями по умолчанию — их можно донастроить позже при необходимости.
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleCreateSubmit}
                  disabled={creating}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                >
                  <Icon name={creating ? 'Loader2' : 'Plus'} size={14} className={creating ? 'animate-spin' : ''} />
                  {creating ? 'Создаю...' : 'Создать запись'}
                </button>
                {createError && <span className="text-sm text-destructive">{createError}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'bulk' && (
        <div className="p-5">
          {loadingBulk ? (
            <div className="flex justify-center py-16">
              <Icon name="Loader2" size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                По одной записи на строку. Вставьте значения через табуляцию (как при копировании из Excel/Google Таблиц)
                или через запятую — сначала <strong>{bulkIdField}</strong>, затем: {bulkEditableFields.join(', ') || '—'}.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Пример: <code className="px-1 py-0.5 rounded bg-secondary">90001, Тестовый предмет, Описание предмета</code>
              </p>
              <textarea
                autoFocus
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                placeholder={`90001\tНазвание 1\tОписание 1\n90002\tНазвание 2\tОписание 2`}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y min-h-[200px]"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBulkSubmit}
                  disabled={submittingBulk || !bulkText.trim()}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                >
                  <Icon name={submittingBulk ? 'Loader2' : 'ListPlus'} size={14} className={submittingBulk ? 'animate-spin' : ''} />
                  {submittingBulk ? 'Добавляю...' : 'Добавить все'}
                </button>
                {bulkAdded !== null && (
                  <span className="text-sm text-emerald-500 flex items-center gap-1.5">
                    <Icon name="Check" size={14} /> Добавлено записей: {bulkAdded}
                  </span>
                )}
                {bulkError && <span className="text-sm text-destructive">{bulkError}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </ModalOverlay>
  );
}
