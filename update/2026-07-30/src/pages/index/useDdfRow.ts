import { useState } from 'react';
import { postJson } from './patchesApi';
import type { SearchResult, FieldDef, RowValue, Mode, RawColumn, ColorGroupDef } from './patchesDdfShared';
import { cleanText } from './patchesDdfShared';
import type { ServerId } from './shared';

export function useDdfRow(
  server: ServerId,
  path: string,
  setMode: (m: Mode) => void,
  setResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
  setTotalRows: React.Dispatch<React.SetStateAction<number>>,
  query: string,
  runSearch: (q: string) => Promise<void>,
) {
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
        const data = await postJson({ action: 'ddf_save_raw', server, path, index: selectedIndex, line: rawLine });
        if (data.moved) {
          // Файл поддерживает сортировку по id (см. _ID_FIELDS/update_record_sorted в backend) —
          // если пользователь поменял в raw-режиме сами id-поля записи, она физически
          // переместилась в файле на новую позицию, а индексы ВСЕХ записей между старой и новой
          // позицией сдвинулись на 1. Список результатов поиска (results), закэшированный из
          // предыдущего ddf_search, теперь содержит устаревшие индексы — перезапрашиваем список
          // заново, чтобы дальнейшие действия (открыть другую запись, удалить) не промахнулись
          // мимо цели; selectedIndex обновляем на новую позицию перемещённой записи.
          setSelectedIndex(data.index);
          runSearch(query);
        }
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

  return {
    selectedIndex,
    setSelectedIndex,
    fields,
    setFields,
    row,
    setRow,
    edits,
    setEdits,
    colorGroup,
    setColorGroup,
    colorHex,
    setColorHex,
    isRawMode,
    setIsRawMode,
    rawLine,
    setRawLine,
    rawColumns,
    setRawColumns,
    idFields,
    setIdFields,
    loadingRow,
    saving,
    saveError,
    saved,
    confirmDelete,
    setConfirmDelete,
    deleting,
    openRow,
    toggleRawView,
    handleSave,
    handleDelete,
    backToSearch,
  };
}
