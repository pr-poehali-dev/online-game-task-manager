import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import type { ColorGroupDef, FieldDef, RowValue } from './patchesDdfShared';
import { cleanText } from './patchesDdfShared';

export default function PatchesDdfViewPanel({
  loadingRow,
  row,
  fields,
  edits,
  setEdits,
  colorGroup,
  colorHex,
  setColorHex,
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
  row: Record<string, RowValue> | null;
  fields: FieldDef[];
  edits: Record<string, string>;
  setEdits: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  colorGroup: ColorGroupDef | null;
  colorHex: string | null;
  setColorHex: (v: string | null) => void;
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
  const colorFieldNames = new Set(colorGroup?.fields || []);
  const [hexDraft, setHexDraft] = useState(colorHex ?? '');
  useEffect(() => { setHexDraft(colorHex ?? ''); }, [colorHex]);

  return (
    <div className="p-5">
      {loadingRow ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        </div>
      ) : row ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border pb-3">
            {fields.filter((f) => !f.editable && !f.array && !colorFieldNames.has(f.name)).map((f) => (
              <span key={f.name}>
                <span className="opacity-70">{f.name}:</span> {cleanText(row[f.name])}
              </span>
            ))}
          </div>

          {colorGroup && colorHex && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Цвет</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  disabled={!canManage}
                  className="h-9 w-14 rounded-lg border border-border bg-background cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                />
                <input
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={() => {
                    if (/^#[0-9a-fA-F]{6}$/.test(hexDraft)) setColorHex(hexDraft);
                    else setHexDraft(colorHex ?? '');
                  }}
                  disabled={!canManage}
                  maxLength={7}
                  spellCheck={false}
                  className="w-24 h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono disabled:opacity-70"
                />
              </div>
            </div>
          )}

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
                onClick={onSave}
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