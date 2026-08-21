import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { IMAGE_ASPECT_RATIOS, VIDEO_DURATIONS } from './AiTypes';
import type { AiUsage } from './AiTypes';

interface AiGenerateComposerProps {
  mode: 'image' | 'video';
  onGenerate: (params: { prompt: string; aspectRatio?: string; duration?: number }) => void;
  generating: boolean;
  usage: AiUsage | null;
  limitExceeded: boolean;
}

export default function AiGenerateComposer({ mode, onGenerate, generating, usage, limitExceeded }: AiGenerateComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);

  const usagePercent = usage && usage.limitRub > 0 ? Math.min(100, (usage.spentRub / usage.limitRub) * 100) : 0;

  function handleSubmit() {
    if (!prompt.trim() || generating || limitExceeded) return;
    onGenerate(mode === 'image' ? { prompt: prompt.trim(), aspectRatio } : { prompt: prompt.trim(), duration });
    setPrompt('');
  }

  return (
    <div className="border-t border-border p-3 sm:p-4">
      {usage && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[200px]">
            <div
              className={`h-full rounded-full transition-all ${usagePercent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <span>Потрачено {usage.spentRub.toFixed(2)} ₽ из {usage.limitRub.toFixed(0)} ₽ в этом месяце</span>
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
      <div className="flex items-center gap-2 mb-2">
        {mode === 'image' ? (
          <div className="flex items-center gap-1.5">
            <Icon name="RectangleHorizontal" size={13} className="text-muted-foreground" />
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {IMAGE_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Icon name="Timer" size={13} className="text-muted-foreground" />
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d} сек</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          disabled={generating || limitExceeded}
          placeholder={mode === 'image' ? 'Опишите изображение, которое нужно сгенерировать…' : 'Опишите видео, которое нужно сгенерировать…'}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 max-h-40 overflow-y-auto scrollbar-thin"
          style={{ minHeight: '42px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={generating || limitExceeded || !prompt.trim()}
          className="h-[42px] w-[42px] shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {generating ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Wand2" size={16} />}
        </button>
      </div>
    </div>
  );
}