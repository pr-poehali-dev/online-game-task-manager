import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { AiAgentStep, AiMessageSource } from './AiTypes';

const STEP_LABELS: Record<string, string> = {
  search: 'Искал в документах',
  read: 'Читал файл',
  list: 'Смотрел список файлов',
};

// AiMessageSources — плашка под ответом ассистента в сессии проекта: какие документы он прочитал,
// чтобы ответить. Нужна для доверия к ответу — сотрудник может открыть источник и проверить.
// Шаги агента («искал», «читал») спрятаны под раскрывающийся блок: они полезны, когда ответ
// кажется странным, но в обычном случае только шумят.
export default function AiMessageSources({
  sources,
  steps,
}: {
  sources?: AiMessageSource[] | null;
  steps?: AiAgentStep[] | null;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const hasSources = !!sources?.length;
  const hasSteps = !!steps?.length;
  if (!hasSources && !hasSteps) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
      {hasSources && (
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0 py-0.5">
            <Icon name="BookOpen" size={11} />
            Источники:
          </span>
          {sources!.map((source) => (
            <a
              key={source.fileId}
              href={source.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={source.quote}
              className="max-w-[220px] flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/60 text-[11px] hover:bg-secondary transition-colors"
            >
              <Icon name="File" size={10} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{source.fileName}</span>
            </a>
          ))}
        </div>
      )}

      {hasSteps && (
        <div>
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Icon name={showSteps ? 'ChevronDown' : 'ChevronRight'} size={10} />
            Как искал ({steps!.length})
          </button>
          {showSteps && (
            <div className="mt-1 pl-3 space-y-0.5">
              {steps!.map((step, i) => (
                <div key={i} className="text-[11px] text-muted-foreground">
                  {STEP_LABELS[step.tool] || step.tool}
                  {step.arg && <span className="text-foreground/70"> «{step.arg}»</span>}
                  {step.found > 0 && <span> — найдено: {step.found}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
