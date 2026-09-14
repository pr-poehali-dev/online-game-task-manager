import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { ADMIN_URL, TOKEN_KEY } from '../admin/adminShared';

interface StorageRow {
  userId: number;
  name: string;
  sizeLimitMb: number;
  usedFiles: number;
  usedMb: number;
  generatedFiles: number;
  generatedMb: number;
  usedPercent: number;
}

function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ГБ`;
  if (mb < 1 && mb > 0) return `${Math.round(mb * 1024)} КБ`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} МБ`;
}

// Цвет полосы по заполнению личного лимита: у потолка — тревожный, иначе спокойный.
function barColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-primary';
}

// Сводка занятого места в разделе AI. Персональные лимиты не дают ОДНОМУ сотруднику забить диск,
// но общего потолка на команду нет — здесь видно, сколько занято всего и кто занимает больше всех.
export default function AiStorageSummary() {
  const [items, setItems] = useState<StorageRow[]>([]);
  const [totalMb, setTotalMb] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [allowedMb, setAllowedMb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' },
        body: JSON.stringify({ action: 'ai_storage_summary' }),
      });
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(data.items || []);
        setTotalMb(data.totalMb || 0);
        setTotalFiles(data.totalFiles || 0);
        setAllowedMb(data.allowedMb || 0);
      }
    } catch {
      /* оставим пустую сводку */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (forbidden) return null;

  const withFiles = items.filter((i) => i.usedFiles > 0);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-semibold flex-1">Место в разделе «AI»</h2>
        <button
          onClick={load}
          title="Обновить"
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="RefreshCw" size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Сколько занимают файлы сотрудников и кто занимает больше всех.
      </p>

      <div className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="py-8 flex justify-center">
            <Icon name="Loader2" size={18} className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pb-4 mb-4 border-b border-border">
              <div>
                <div className="text-2xl font-semibold leading-none">{fmtMb(totalMb)}</div>
                <div className="text-xs text-muted-foreground mt-1">занято всего · {totalFiles} файлов</div>
              </div>
              <div>
                <div className="text-sm">{fmtMb(allowedMb)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  потолок по всем лимитам
                </div>
              </div>
            </div>

            {withFiles.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Сотрудники пока ничего не загружали
              </div>
            ) : (
              <div className="space-y-3">
                {withFiles.map((u) => (
                  <div key={u.userId}>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <span className="flex-1 truncate">{u.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0">
                        {fmtMb(u.usedMb)} из {fmtMb(u.sizeLimitMb)} · {u.usedFiles} файлов
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${barColor(u.usedPercent)} transition-all`}
                        style={{ width: `${Math.min(100, u.usedPercent)}%` }}
                      />
                    </div>
                    {u.generatedMb > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        из них {fmtMb(u.generatedMb)} сгенерировано моделью ({u.generatedFiles})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
              Лимит объёма каждому сотруднику меняется в разделе «Команда». В него входят все
              файлы: и загруженные, и сгенерированные моделью.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
