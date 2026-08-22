import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { diffLines, isDiffable } from './aiCodeDiff';
import type { DiffRow } from './aiCodeDiff';

interface AiCodeDiffProps {
  before: string;
  after: string;
  language?: string | null;
  /** Заголовок над сравнением — например «Правки» или имя файла. */
  title?: string;
  onClose?: () => void;
}

// Цвета строк: зелёный — добавлено, красный — удалено, янтарный — изменено. Берём полупрозрачные
// фоны, чтобы работало и в светлой, и в тёмной теме без отдельных наборов цветов.
const ROW_STYLES: Record<DiffRow['kind'], { left: string; right: string }> = {
  equal: { left: '', right: '' },
  added: { left: 'bg-muted/40', right: 'bg-emerald-500/15' },
  removed: { left: 'bg-rose-500/15', right: 'bg-muted/40' },
  modified: { left: 'bg-rose-500/15', right: 'bg-emerald-500/15' },
};

function Cell({ text, no, cls, sign }: { text?: string; no?: number; cls: string; sign?: string }) {
  return (
    <div className={`flex ${cls}`}>
      <span className="w-9 shrink-0 select-none text-right pr-2 opacity-35 tabular-nums">{no ?? ''}</span>
      <span className="w-3 shrink-0 select-none opacity-60">{sign ?? ''}</span>
      <span className="flex-1 whitespace-pre-wrap break-words pr-2">{text ?? ''}</span>
    </div>
  );
}

export default function AiCodeDiff({ before, after, title, onClose }: AiCodeDiffProps) {
  // split — две колонки рядом (нагляднее для правок), unified — одна лента (удобнее на узком
  // экране и для длинных строк).
  const [split, setSplit] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);

  const tooBig = !isDiffable(before, after);
  const { rows, stats } = useMemo(
    () => (tooBig ? { rows: [], stats: { added: 0, removed: 0, modified: 0 } } : diffLines(before, after)),
    [before, after, tooBig]
  );

  // Скрытие неизменённых участков: оставляем 2 строки контекста вокруг каждой правки, чтобы было
  // понятно, куда именно она относится.
  const visible = useMemo(() => {
    if (!onlyChanges) return rows;
    const keep = new Set<number>();
    rows.forEach((r, i) => {
      if (r.kind === 'equal') return;
      for (let k = Math.max(0, i - 2); k <= Math.min(rows.length - 1, i + 2); k++) keep.add(k);
    });
    return rows.filter((_, i) => keep.has(i));
  }, [rows, onlyChanges]);

  if (tooBig) {
    return (
      <div className="my-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        Файлы слишком большие для наглядного сравнения — покажем код обычными блоками.
      </div>
    );
  }

  const unchanged = stats.added === 0 && stats.removed === 0 && stats.modified === 0;

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/60 text-[11px] text-muted-foreground flex-wrap">
        <Icon name="GitCompare" size={12} />
        <span className="font-medium text-foreground">{title || 'Сравнение правок'}</span>
        {unchanged ? (
          <span className="opacity-70">различий нет</span>
        ) : (
          <span className="flex items-center gap-2">
            {stats.added > 0 && <span className="text-emerald-500">+{stats.added}</span>}
            {stats.removed > 0 && <span className="text-rose-500">−{stats.removed}</span>}
            {stats.modified > 0 && <span className="text-amber-500">±{stats.modified}</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={() => setOnlyChanges((v) => !v)}
            title={onlyChanges ? 'Показать весь код' : 'Показать только изменённые места'}
            className={`transition-colors ${onlyChanges ? 'text-primary' : 'hover:text-foreground'}`}
          >
            <Icon name="Filter" size={11} />
          </button>
          <button
            onClick={() => setSplit((v) => !v)}
            title={split ? 'Показать одной лентой' : 'Показать в две колонки'}
            className="hover:text-foreground transition-colors"
          >
            <Icon name={split ? 'Columns2' : 'Rows3'} size={11} />
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(after)}
            title="Скопировать исправленный код"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Icon name="Copy" size={11} />
            Готовый код
          </button>
          {onClose && (
            <button onClick={onClose} title="Скрыть сравнение" className="hover:text-foreground transition-colors">
              <Icon name="X" size={12} />
            </button>
          )}
        </div>
      </div>

      {split && (
        <div className="grid grid-cols-2 text-[11px] font-medium text-muted-foreground bg-secondary/30 border-b border-border">
          <div className="px-3 py-1 border-r border-border">Было</div>
          <div className="px-3 py-1">Стало</div>
        </div>
      )}

      <div className="overflow-x-auto scrollbar-thin max-h-[420px] overflow-y-auto font-mono text-[12px] leading-[1.5]">
        {split ? (
          <div className="grid grid-cols-2 min-w-max w-full">
            <div className="border-r border-border">
              {visible.map((r, i) => (
                <Cell
                  key={i}
                  text={r.left}
                  no={r.leftNo}
                  cls={ROW_STYLES[r.kind].left}
                  sign={r.kind === 'removed' || r.kind === 'modified' ? '-' : ''}
                />
              ))}
            </div>
            <div>
              {visible.map((r, i) => (
                <Cell
                  key={i}
                  text={r.right}
                  no={r.rightNo}
                  cls={ROW_STYLES[r.kind].right}
                  sign={r.kind === 'added' || r.kind === 'modified' ? '+' : ''}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="min-w-max w-full">
            {visible.map((r, i) => {
              // В одноленточном виде изменённая строка показывается двумя: сначала старая, потом новая.
              if (r.kind === 'modified') {
                return (
                  <div key={i}>
                    <Cell text={r.left} no={r.leftNo} cls={ROW_STYLES.removed.left} sign="-" />
                    <Cell text={r.right} no={r.rightNo} cls={ROW_STYLES.added.right} sign="+" />
                  </div>
                );
              }
              const isAdd = r.kind === 'added';
              return (
                <Cell
                  key={i}
                  text={isAdd ? r.right : r.left}
                  no={isAdd ? r.rightNo : r.leftNo}
                  cls={isAdd ? ROW_STYLES.added.right : r.kind === 'removed' ? ROW_STYLES.removed.left : ''}
                  sign={isAdd ? '+' : r.kind === 'removed' ? '-' : ''}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
