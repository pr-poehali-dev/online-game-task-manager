import Icon from '@/components/ui/icon';
import { ModalOverlay } from './shared';
import type { ServerId } from './shared';
import PatchesDdfSearchPanel from './PatchesDdfSearchPanel';
import PatchesDdfViewPanel from './PatchesDdfViewPanel';
import PatchesDdfCreatePanel from './PatchesDdfCreatePanel';
import PatchesDdfBulkPanel from './PatchesDdfBulkPanel';
import PatchesDdfRawPanel from './PatchesDdfRawPanel';
import PatchesDdfRangePanel from './PatchesDdfRangePanel';
import { useDdfSearch } from './useDdfSearch';
import { useDdfRow } from './useDdfRow';
import { useDdfCreate } from './useDdfCreate';
import { useDdfBulk } from './useDdfBulk';
import { useDdfRange } from './useDdfRange';

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
  const search = useDdfSearch(server, path);
  const {
    mode, setMode, query, setQuery, results, setResults, totalRows, setTotalRows,
    searching, searchError, isRawOnlySchema, hasMore, loadingMore, hasIdField, canAppend, runSearch, loadMore,
  } = search;

  const rowState = useDdfRow(server, path, setMode, setResults, setTotalRows, query, runSearch);
  const {
    fields, row, edits, setEdits, colorGroup, colorHex, setColorHex,
    isRawMode, rawLine, setRawLine, rawColumns, idFields, loadingRow, saving, saveError,
    saved, confirmDelete, setConfirmDelete, deleting, openRow, toggleRawView, handleSave,
    handleDelete, backToSearch,
  } = rowState;

  const create = useDdfCreate(
    server, path, setMode, setQuery, runSearch, idFields, rawColumns, rawLine
  );
  const {
    createRawLine, setCreateRawLine, createRawColumns,
    createIdFields, loadingCreate, creating, createError, openCreate, openDuplicate, handleCreateSubmit,
  } = create;

  const bulk = useDdfBulk(server, path, setMode, query, runSearch);
  const {
    bulkText, setBulkText, bulkTemplateLine, bulkRawColumns, loadingBulk, submittingBulk,
    bulkError, bulkAdded, bulkIdFields, openBulk, handleBulkSubmit,
  } = bulk;

  const range = useDdfRange(server, path);
  const {
    idFrom, setIdFrom, idTo, setIdTo, rangeRows, rangeTruncated, loadingRange,
    rangeError, rangeLoaded, savingRows, savedRows, rowErrors,
    loadRange, resetRange, updateCell, saveRow,
  } = range;

  function openRange() {
    resetRange();
    setMode('range');
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
          hasIdField={hasIdField}
          onOpenRange={openRange}
          canAppend={canAppend}
        />
      )}

      {mode === 'range' && (
        <PatchesDdfRangePanel
          idFrom={idFrom}
          setIdFrom={setIdFrom}
          idTo={idTo}
          setIdTo={setIdTo}
          rangeRows={rangeRows}
          rangeTruncated={rangeTruncated}
          loadingRange={loadingRange}
          rangeError={rangeError}
          rangeLoaded={rangeLoaded}
          canManage={canManage}
          savingRows={savingRows}
          savedRows={savedRows}
          rowErrors={rowErrors}
          onLoadRange={loadRange}
          onCellChange={updateCell}
          onSaveRow={saveRow}
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
          bulkIdFields={bulkIdFields}
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