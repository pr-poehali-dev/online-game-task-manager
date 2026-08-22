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
import {
  providerLabel,
  modelComparableCost,
  modelPriceTierRelative,
  findSupersedingModel,
} from './AiTypes';
import type { AiModelsMap } from './AiTypes';

interface AiModelPickerProps {
  models: AiModelsMap;
  modelsLoading: boolean;
  value: string;
  onChange: (model: string) => void;
  // onOpenFaq — открыть справку «как выбрать модель». На телефоне отдельной кнопки в шапке нет
  // (не хватает места в одном ряду), поэтому вход в справку живёт здесь, рядом с выбором модели.
  onOpenFaq?: () => void;
}

type Tab = 'recommended' | 'advanced' | 'cheap';

const TABS: { id: Tab; label: string }[] = [
  { id: 'recommended', label: 'Рекомендуемые' },
  { id: 'advanced', label: 'Продвинутые' },
  { id: 'cheap', label: 'Дешёвые' },
];

function fmtPrice(info: AiModelsMap[string]): string {
  // prompt_cost/completion_cost — рубли за 1 млн токенов, min/max_price_per_image — за картинку,
  // min/max_price_per_second — за секунду видео (см. docs/ai-tunnel-api-reference.md).
  if (info.prompt_cost != null && info.completion_cost != null) {
    return `${info.prompt_cost.toLocaleString('ru-RU')} / ${info.completion_cost.toLocaleString('ru-RU')} ₽/1М`;
  }
  if (info.min_price_per_image != null) {
    return `от ${info.min_price_per_image.toLocaleString('ru-RU')} ₽/шт`;
  }
  if (info.min_price_per_second != null) {
    return `от ${info.min_price_per_second.toLocaleString('ru-RU')} ₽/сек`;
  }
  return '';
}

export default function AiModelPicker({ models, modelsLoading, value, onChange, onOpenFaq }: AiModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('recommended');

  // costsSorted — цены ВСЕХ моделей текущей группы (chat/images/videos), нужны для относительных
  // перцентилей категории "Дешёвые"/"Продвинутые" (modelPriceTierRelative в AiTypes.ts) —
  // абсолютные пороги не подходят, т.к. группы отличаются на порядки (токены/картинки/секунды).
  const costsSorted = useMemo(() => {
    return Object.values(models)
      .map((info) => modelComparableCost(info))
      .filter((c): c is number => c != null)
      .sort((a, b) => a - b);
  }, [models]);

  // legacyOf — какой моделью заменена устаревшая (findSupersedingModel в AiTypes.ts): считается
  // один раз на весь загруженный каталог, не пересчитывается при каждом рендере списка.
  const legacyOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, info] of Object.entries(models)) {
      const superseding = findSupersedingModel(id, info, models);
      if (superseding) map.set(id, superseding);
    }
    return map;
  }, [models]);

  const groups = useMemo(() => {
    const byProvider = new Map<string, { id: string; info: AiModelsMap[string]; cost: number | null; legacy: boolean }[]>();
    for (const [id, info] of Object.entries(models)) {
      const cost = modelComparableCost(info);
      const tier = modelPriceTierRelative(cost, costsSorted);
      if (tab === 'cheap' && tier !== 'cheap') continue;
      if (tab === 'advanced' && tier !== 'premium') continue;
      // 'recommended' — показываем все, кроме явно устаревших моделей (их видно на вкладке
      // "Продвинутые"/"Дешёвые", если они туда попадают по цене, но с плашкой).
      const key = info.provider || 'other';
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key)!.push({ id, info, cost, legacy: legacyOf.has(id) });
    }
    return Array.from(byProvider.entries())
      .map(([provider, items]) => ({
        provider,
        label: providerLabel(provider),
        // Внутри провайдера — сначала актуальные модели (не legacy), затем устаревшие, и в
        // каждой части — от дорогой (мощной) к дешёвой.
        items: items.sort((a, b) => {
          if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
          return (b.cost ?? 0) - (a.cost ?? 0);
        }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [models, tab, costsSorted, legacyOf]);

  const current = models[value];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* На телефоне кнопка компактная: «Авто» вместо «Авто (подбор ИИ)» и жёсткий лимит
            ширины — иначе длинное имя модели вытесняет вкладки режимов из общего ряда. */}
        <button
          title={value === 'auto' ? 'Авто (подбор ИИ)' : value}
          className="h-9 px-2 sm:px-3 rounded-lg border border-border bg-secondary/60 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm hover:bg-secondary transition-colors max-w-[104px] sm:max-w-[220px]"
        >
          <Icon name="Sparkles" size={14} className="text-primary shrink-0" />
          <span className="truncate">
            <span className="sm:hidden">{value === 'auto' ? 'Авто' : value || 'Модель'}</span>
            <span className="hidden sm:inline">{value === 'auto' ? 'Авто (подбор ИИ)' : value || 'Выбрать модель'}</span>
          </span>
          <Icon name="ChevronDown" size={13} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-2 pb-0">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-sm font-semibold">Нейросети</span>
            {onOpenFaq && (
              <button
                onClick={() => { setOpen(false); onOpenFaq(); }}
                className="sm:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="HelpCircle" size={13} />
                Как выбрать
              </button>
            )}
          </div>
          <div className="flex gap-1.5 pb-2 overflow-x-auto scrollbar-thin">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                  tab === t.id
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
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
                {tab === 'recommended' && (
                  <CommandGroup heading="Рекомендуется">
                    <CommandItem
                      value="auto авто оптимальная"
                      onSelect={() => { onChange('auto'); setOpen(false); }}
                      className="flex items-center gap-2"
                    >
                      <Icon name="Wand2" size={14} className="text-primary shrink-0" />
                      <span className="flex-1">Оптимальная нейросеть — ИИ сам подберёт модель</span>
                      {value === 'auto' && <Icon name="Check" size={14} className="text-primary shrink-0" />}
                    </CommandItem>
                  </CommandGroup>
                )}
                {groups.map((g) => (
                  <CommandGroup key={g.provider} heading={g.label}>
                    {g.items.map(({ id, info, legacy }) => (
                      <CommandItem
                        key={id}
                        value={`${id} ${g.label}`}
                        onSelect={() => { onChange(id); setOpen(false); }}
                        className="flex flex-col items-start gap-0.5 py-2"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className={`flex-1 truncate font-mono text-xs ${legacy ? 'text-muted-foreground' : ''}`}>{id}</span>
                          {legacy && (
                            <span
                              title={`Есть более новая и не более дорогая модель: ${legacyOf.get(id)}`}
                              className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            >
                              Устарела
                            </span>
                          )}
                          {value === id && <Icon name="Check" size={14} className="text-primary shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {info.description && <span className="truncate max-w-[200px]">{info.description}</span>}
                          <span className="shrink-0">{fmtPrice(info)}</span>
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