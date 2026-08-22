import Icon from '@/components/ui/icon';
import type { AiUsage } from './AiTypes';

interface AiGenerateStatusBarProps {
  mode: 'image' | 'video';
  usage: AiUsage | null;
  limitExceeded: boolean;
  n: number;
  countOptionsLength: number;
  refError: string;
}

// Верхний блок композера генерации: остаток лимита, предупреждения по режиму и ошибка загрузки
// референса. Вынесено из AiGenerateComposer без изменений разметки и условий показа.
export default function AiGenerateStatusBar({
  mode, usage, limitExceeded, n, countOptionsLength, refError,
}: AiGenerateStatusBarProps) {
  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;

  return (
    <>
      {usage && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div
              className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <span className="sm:hidden">{usage.spentRub.toFixed(0)} / {usage.limitRub.toFixed(0)} ₽</span>
          <span className="hidden sm:inline">Потрачено {usage.spentRub.toFixed(2)} ₽ из {usage.limitRub.toFixed(0)} ₽ в этом месяце</span>
        </div>
      )}
      {limitExceeded && (
        <div className="mb-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} />
          Месячный лимит на AI исчерпан — обратитесь к администратору для увеличения лимита
        </div>
      )}
      {mode === 'video' && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Генерация видео платная сразу при запуске — отменить или вернуть деньги за уже начатую генерацию нельзя
        </div>
      )}

      {mode === 'image' && n > 1 && countOptionsLength > 1 && (
        <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={12} className="shrink-0" />
          Не все модели умеют делать несколько вариантов за раз — некоторые вернут одно изображение, даже если запрошено больше
        </div>
      )}
      {refError && (
        <div className="mb-2 text-xs text-destructive flex items-center gap-1.5">
          <Icon name="AlertCircle" size={13} className="shrink-0" />
          {refError}
        </div>
      )}
    </>
  );
}
