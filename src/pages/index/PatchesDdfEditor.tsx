import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { ModalOverlay } from './shared';
import type { ServerId } from './shared';
import { postJson } from './patchesApi';
import type { SearchResult, FieldDef, RowValue, Mode, RawColumn, ColorGroupDef } from './patchesDdfShared';
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [row, setRow] = useState<Record<string, RowValue> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [colorGroup, setColorGroup] = useState<ColorGroupDef | null>(null);
  const [colorHex, setColorHex] = useState<string | null>(null);
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawLine, setRawLine] = useState<string | null>(null);
  const [rawColumns, setRawColumns] = useState<RawColumn[]>([]);
  const [idFields, setIdFields] = useState<string[]>([]);
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [createFields, setCreateFields] = useState<FieldDef[]>([]);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [createRawLine, setCreateRawLine] = useState('');
  const [createRawColumns, setCreateRawColumns] = useState<RawColumn[]>([]);
  const [createIdFields, setCreateIdFields] = useState<string[]>([]);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [bulkFields, setBulkFields] = useState<FieldDef[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkTemplateLine, setBulkTemplateLine] = useState('');
  const [bulkRawColumns, setBulkRawColumns] = useState<RawColumn[]>([]);
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkAdded, setBulkAdded] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setSearchError('');
    try {
      const data = await postJson({ action: 'ddf_search', server, path, query: q, limit: 50, offset: 0 });
      setResults(data.results || []);
      setTotalRows(data.totalRows || 0);
      setIsRawOnlySchema(!!data.isRawOnly);
      setHasMore(!!data.hasMore);
    } catch {
      setSearchError('Не удалось выполнить поиск');
    } finally {
      setSearching(false);
    }
  }, [server, path]);

  // Список результатов поиска раньше был жёстко ограничен первыми 50 записями файла (при пустом
  // запросе) — прокрутка "обрывалась" без явной причины, т.к. дальше просто не было загруженных
  // данных (см. hasMore/offset в backend action ddf_search). Теперь по нажатию "Показать ещё"
  // подгружаем следующую порцию, начиная с offset = текущее число уже показанных результатов —
  // dозагруженные результаты ДОБАВЛЯЮТСЯ к уже отображённым (не заменяют их).
  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await postJson({ action: 'ddf_search', server, path, query, limit: 50, offset: results.length });
      setResults((prev) => [...prev, ...(data.results || [])]);
      setHasMore(!!data.hasMore);
    } catch {
      setSearchError('Не удалось загрузить ещё записи');
    } finally {
      setLoadingMore(false);
    }
  }

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
      setIdFields(data.idFields || []);
      if (data.isRawOnly) {
        setIsRawMode(true);
        setMode('raw');
        const rawData = await postJson({ action: 'ddf_get_raw', server, path, index });
        setRawLine(rawData.line ?? '');
        setRawColumns(rawData.columns || []);
      } else {
        setIsRawMode(false);
        setMode('view');
        setFields(data.fields || []);
        setRow(data.row || {});
        setColorGroup(data.colorGroup || null);
        setColorHex(data.colorHex || null);
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

  // Переключатель "форма / текст целиком" для ОБЫЧНЫХ схем (не isRawOnlySchema — те и так
  // всегда открыты в raw, переключать некуда). Раньше raw-режим показывался только для
  // "особых" файлов (armorgrp/etcitemgrp/recipe — с MTX/MAT-полями без человеческих текстовых
  // полей), хотя backend (ddf_get_raw/ddf_save_raw) всегда умел работать с ЛЮБОЙ схемой —
  // теперь пользователь может по желанию открыть текстовое представление записи целиком (как в
  // l2disasm TSV-экспорте) даже у обычных файлов, чтобы получить доступ к полям, для которых нет
  // отдельной формы (счётчики массивов, служебные UNK_* и т.п.). Несохранённые правки текущего
  // режима при переключении отбрасываются — данные перезапрашиваются заново с сервера.
  async function toggleRawView() {
    if (selectedIndex === null) return;
    setLoadingRow(true);
    setSaveError('');
    setSaved(false);
    try {
      if (isRawMode) {
        const data = await postJson({ action: 'ddf_get', server, path, index: selectedIndex });
        setIsRawMode(false);
        setMode('view');
        setFields(data.fields || []);
        setRow(data.row || {});
        setColorGroup(data.colorGroup || null);
        setColorHex(data.colorHex || null);
        const initialEdits: Record<string, string> = {};
        for (const f of data.fields || []) {
          if (f.editable) initialEdits[f.name] = cleanText(data.row?.[f.name]);
        }
        setEdits(initialEdits);
      } else {
        const rawData = await postJson({ action: 'ddf_get_raw', server, path, index: selectedIndex });
        setIsRawMode(true);
        setMode('raw');
        setRawLine(rawData.line ?? '');
        setRawColumns(rawData.columns || []);
      }
    } catch {
      setSaveError('Не удалось переключить режим просмотра');
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
        await postJson({ action: 'ddf_save', server, path, index: selectedIndex, edits, colorHex });
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
    setColorGroup(null);
    setColorHex(null);
    setIsRawMode(false);
    setRawLine(null);
    setRawColumns([]);
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
      setCreateIdFields(data.idFields || []);
      if (data.isRawOnly) {
        // raw-only схемы (armorgrp/etcitemgrp/recipe и т.п.) не имеют отдельных "человеческих"
        // полей — форма создания показывает ту же таб-строку целиком, что и обычный просмотр
        // записи (ddf_get_raw), стартуя с пустого шаблона по умолчанию (см. ddf_new в index.py).
        setCreateRawLine(data.rawLine ?? '');
        setCreateRawColumns(data.rawColumns || []);
        setCreateFields([]);
      } else {
        const flds: FieldDef[] = data.fields || [];
        setCreateFields(flds);
        const initial: Record<string, string> = {};
        for (const f of flds) {
          if (f.array) continue;
          initial[f.name] = cleanText(data.row?.[f.name]);
        }
        setCreateValues(initial);
      }
    } catch {
      setCreateError('Не удалось загрузить форму создания');
    } finally {
      setLoadingCreate(false);
    }
  }

  // «Дублировать» — открывает ту же форму "создать новую запись", но предзаполненную значениями
  // ТЕКУЩЕЙ открытой записи (обычной или raw), а не пустым шаблоном (в отличие от openCreate).
  // id-поля (см. idFields/_ID_FIELDS в ddf_registry*.py) намеренно ОЧИЩАЮТСЯ (не копируются) —
  // иначе форма стартовала бы уже с гарантированным конфликтом дубликата, который backend всё
  // равно заблокирует при сохранении (см. ddf_create/_ddf_check_duplicate_key в index.py) —
  // пользователю проще сразу увидеть пустое поле id и вписать новое значение, чем сначала
  // получить ошибку "уже существует" и только потом сообразить, что нужно поменять именно id.
  //
  // Решение "какую форму открыть" опирается на isRawOnlySchema (та же логика, что и
  // handleCreateSubmit — раз схема raw-only, отправка ВСЕГДА идёт через rawLines), а НЕ на
  // текущий isRawMode — пользователь мог вручную переключить ОБЫЧНУЮ запись в текстовый вид
  // через toggleRawView, но row/fields при этом остаются последними загруженными данными
  // обычной формы (toggleRawView их не очищает при переходе в raw) — этого достаточно.
  function openDuplicate() {
    setMode('create');
    setCreateError('');
    setCreateIdFields(idFields);
    if (isRawOnlySchema) {
      setCreateRawColumns(rawColumns);
      if (rawLine !== null && idFields.length && rawColumns.length) {
        const tokens = rawLine.split('\t');
        const labels = rawColumns.map((c) => c.label);
        for (const idName of idFields) {
          const i = labels.indexOf(idName);
          if (i !== -1) tokens[i] = '';
        }
        setCreateRawLine(tokens.join('\t'));
      } else {
        setCreateRawLine(rawLine ?? '');
      }
      setCreateFields([]);
    } else {
      setCreateFields(fields);
      const initial: Record<string, string> = {};
      for (const f of fields) {
        if (f.array) continue;
        initial[f.name] = idFields.includes(f.name) ? '' : cleanText(row?.[f.name] ?? null);
      }
      setCreateValues(initial);
    }
  }

  async function handleCreateSubmit() {
    setCreating(true);
    setCreateError('');
    try {
      if (isRawOnlySchema) {
        await postJson({ action: 'ddf_create', server, path, rawLines: [createRawLine] });
      } else {
        const rowPayload: Record<string, string> = {};
        for (const f of createFields) {
          if (f.array) continue;
          rowPayload[f.name] = createValues[f.name] ?? '';
        }
        await postJson({ action: 'ddf_create', server, path, rows: [rowPayload] });
      }
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
        <div className="flex items-center gap-2 shrink-0">
          {(mode === 'view' || mode === 'raw') && !isRawOnlySchema && (
            <button
              onClick={toggleRawView}
              disabled={loadingRow}
              title={isRawMode ? 'Показать обычную форму' : 'Показать все поля текстом'}
              className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <Icon name={isRawMode ? 'FormInput' : 'Code'} size={13} />
              {isRawMode ? 'Форма' : 'Текстом'}
            </button>
          )}
          <button onClick={onClose} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Icon name="X" size={16} />
          </button>
        </div>
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
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
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
          colorGroup={colorGroup}
          colorHex={colorHex}
          setColorHex={setColorHex}
          canManage={canManage}
          saving={saving}
          saved={saved}
          saveError={saveError}
          onSave={handleSave}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          deleting={deleting}
          onDelete={handleDelete}
          onDuplicate={openDuplicate}
        />
      )}

      {mode === 'raw' && (
        <PatchesDdfRawPanel
          loadingRow={loadingRow}
          line={rawLine}
          setLine={setRawLine}
          columns={rawColumns}
          canManage={canManage}
          saving={saving}
          saved={saved}
          saveError={saveError}
          onSave={handleSave}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          deleting={deleting}
          onDelete={handleDelete}
          onDuplicate={openDuplicate}
        />
      )}

      {mode === 'create' && (
        <PatchesDdfCreatePanel
          loadingCreate={loadingCreate}
          isRawOnly={isRawOnlySchema}
          createFields={createFields}
          createValues={createValues}
          setCreateValues={setCreateValues}
          createRawLine={createRawLine}
          setCreateRawLine={setCreateRawLine}
          createRawColumns={createRawColumns}
          createIdFields={createIdFields}
          creating={creating}
          createError={createError}
          onSubmit={handleCreateSubmit}
        />
      )}

      {mode === 'bulk' && (
        <PatchesDdfBulkPanel
          loadingBulk={loadingBulk}
          isRawOnly={isRawOnlySchema}
          bulkIdField={bulkIdField}
          bulkEditableFields={bulkEditableFields}
          bulkTemplateLine={bulkTemplateLine}
          bulkRawColumns={bulkRawColumns}
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