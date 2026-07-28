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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  async function openRow(index: number) {
    setSelectedIndex(index);
    setLoadingRow(true);
    setSaveError('');
    setSaved(false);
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

  function backToSearch() {
    setSelectedIndex(null);
    setRow(null);
    setFields([]);
    setEdits({});
    setSaveError('');
    setSaved(false);
  }

  const fileName = path.split('/').pop() || path;

  return (
    <ModalOverlay onClose={onClose} wide>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {selectedIndex !== null && (
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

      {selectedIndex === null ? (
        <div className="p-5">
          <div className="relative mb-4">
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
      ) : (
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
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">Не удалось загрузить запись</p>
          )}
        </div>
      )}
    </ModalOverlay>
  );
}