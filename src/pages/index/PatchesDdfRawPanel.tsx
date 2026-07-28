import Icon from '@/components/ui/icon';

export default function PatchesDdfRawPanel({
  loadingRow,
  line,
  setLine,
  canManage,
  saving,
  saved,
  saveError,
  onSave,
  confirmDelete,
  setConfirmDelete,
  deleting,
  onDelete,
}: {
  loadingRow: boolean;
  line: string | null;
  setLine: (v: string) => void;
  canManage: boolean;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onSave: () => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="p-5">
      {loadingRow ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : line !== null ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            У этого файла сложная структура записи (модели/текстуры/материалы) — редактируйте её целиком одной строкой,
            как в декомпилированном исходнике. Значения разделены табуляцией — не удаляйте и не добавляйте лишние табы.
          </p>
          <textarea
            autoFocus
            value={line}
            onChange={(e) => setLine(e.target.value)}
            disabled={!canManage}
            rows={10}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono resize-y min-h-[200px] disabled:opacity-70 whitespace-pre overflow-x-auto"
          />

          <div className="flex items-center gap-3 pt-2">
            {canManage && (
              <button
                onClick={onSave}
                disabled={saving}
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
                      onClick={onDelete}
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
  );
}
