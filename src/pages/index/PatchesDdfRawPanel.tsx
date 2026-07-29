import Icon from '@/components/ui/icon';
import type { RawColumn } from './patchesDdfShared';

export default function PatchesDdfRawPanel({
  loadingRow,
  line,
  setLine,
  columns,
  canManage,
  saving,
  saved,
  saveError,
  onSave,
  confirmDelete,
  setConfirmDelete,
  deleting,
  onDelete,
  onDuplicate,
}: {
  loadingRow: boolean;
  line: string | null;
  setLine: (v: string) => void;
  columns: RawColumn[];
  canManage: boolean;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onSave: () => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const tokens = line !== null ? line.split('\t') : [];
  const labels = columns.length === tokens.length ? columns.map((c) => c.label) : tokens.map((_, i) => String(i));

  function setTokenAt(index: number, value: string) {
    const next = [...tokens];
    next[index] = value;
    setLine(next.join('\t'));
  }

  return (
    <div className="p-5">
      {loadingRow ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : line !== null ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            У этого файла сложная структура записи (модели/текстуры/материалы) — под названием каждой колонки указано её значение.
            Правьте значения по отдельности — структура строки сохраняется автоматически.
          </p>

          <div className="border border-border rounded-lg overflow-x-auto scrollbar-thin">
            <table className="border-collapse">
              <tbody>
                <tr>
                  {labels.map((label, i) => (
                    <td key={i} className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-r border-border last:border-r-0 whitespace-nowrap bg-secondary/40">
                      {label}
                    </td>
                  ))}
                </tr>
                <tr>
                  {tokens.map((token, i) => (
                    <td key={i} className="p-0 border-r border-border last:border-r-0">
                      <input
                        value={token}
                        onChange={(e) => setTokenAt(i, e.target.value)}
                        disabled={!canManage}
                        spellCheck={false}
                        className="h-9 px-2 text-xs font-mono bg-background disabled:opacity-70 outline-none focus:bg-secondary/30 min-w-[60px]"
                        style={{ width: `${Math.max(60, Math.min(240, token.length * 7 + 20))}px` }}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

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
              <button
                onClick={onDuplicate}
                title="Создать новую запись на основе этой"
                className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Icon name="Copy" size={14} />
              </button>
            )}
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