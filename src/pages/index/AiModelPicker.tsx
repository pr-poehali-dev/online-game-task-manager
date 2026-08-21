import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { providerLabel } from './AiTypes';
import type { AiModelsMap } from './AiTypes';

interface AiModelPickerProps {
  models: AiModelsMap;
  modelsLoading: boolean;
  value: string;
  onChange: (model: string) => void;
}

function fmtPrice(rub: number | undefined): string {
  if (!rub) return '';
  // prompt_cost/completion_cost — рубли за 1 млн токенов (см. docs/ai-tunnel-api-reference.md).
  return `${rub.toLocaleString('ru-RU')} ₽/1М`;
}

export default function AiModelPicker({ models, modelsLoading, value, onChange }: AiModelPickerProps) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const byProvider = new Map<string, { id: string; info: AiModelsMap[string] }[]>();
    for (const [id, info] of Object.entries(models)) {
      const key = info.provider || 'other';
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key)!.push({ id, info });
    }
    return Array.from(byProvider.entries())
      .map(([provider, items]) => ({ provider, label: providerLabel(provider), items: items.sort((a, b) => a.id.localeCompare(b.id)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [models]);

  const current = models[value];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-9 px-3 rounded-lg border border-border bg-secondary/60 flex items-center gap-2 text-sm hover:bg-secondary transition-colors max-w-[220px]"
        >
          <Icon name="Sparkles" size={14} className="text-primary shrink-0" />
          <span className="truncate">{value === 'auto' ? 'Авто (подбор ИИ)' : value || 'Выбрать модель'}</span>
          <Icon name="ChevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск модели или провайдера..." />
          <CommandList>
            {modelsLoading ? (
              <div className="py-6 flex justify-center">
                <Icon name="Loader2" size={18} className="animate-spin text-primary" />
              </div>
            ) : (
              <>
                <CommandEmpty>Ничего не найдено</CommandEmpty>
                <CommandGroup heading="Рекомендуется">
                  <CommandItem
                    value="auto авто"
                    onSelect={() => { onChange('auto'); setOpen(false); }}
                    className="flex items-center gap-2"
                  >
                    <Icon name="Wand2" size={14} className="text-primary shrink-0" />
                    <span className="flex-1">Авто — ИИ сам подберёт модель</span>
                    {value === 'auto' && <Icon name="Check" size={14} className="text-primary shrink-0" />}
                  </CommandItem>
                </CommandGroup>
                {groups.map((g) => (
                  <CommandGroup key={g.provider} heading={g.label}>
                    {g.items.map(({ id, info }) => (
                      <CommandItem
                        key={id}
                        value={`${id} ${g.label}`}
                        onSelect={() => { onChange(id); setOpen(false); }}
                        className="flex flex-col items-start gap-0.5 py-2"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="flex-1 truncate font-mono text-xs">{id}</span>
                          {value === id && <Icon name="Check" size={14} className="text-primary shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {info.description && <span className="truncate max-w-[200px]">{info.description}</span>}
                          {info.prompt_cost != null && <span className="shrink-0">{fmtPrice(info.prompt_cost)}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
      {current?.description && (
        <p className="sr-only">{current.description}</p>
      )}
    </Popover>
  );
}
