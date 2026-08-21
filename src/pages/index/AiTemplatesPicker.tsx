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
import type { AiPromptTemplate } from './AiPromptTemplates';
import type { AiMode } from './AiTypes';

interface AiTemplatesPickerProps {
  mode: AiMode;
  templates: AiPromptTemplate[];
  loading: boolean;
  onSelect: (prompt: string) => void;
  onManage: () => void;
  hasDraft: boolean;
}

export default function AiTemplatesPicker({ mode, templates, loading, onSelect, onManage, hasDraft }: AiTemplatesPickerProps) {
  const [open, setOpen] = useState(false);

  // Категория, соответствующая текущему режиму композера (код/остальное), поднимается наверх
  // списка — сотруднику в режиме "Код" в первую очередь актуальны шаблоны код-ревью/рефакторинга,
  // а не пост в соцсети. Остальные категории идут следом в исходном порядке появления.
  const groups = useMemo(() => {
    const byCategory = new Map<string, AiPromptTemplate[]>();
    const order: string[] = [];
    for (const t of templates) {
      if (!byCategory.has(t.category)) { byCategory.set(t.category, []); order.push(t.category); }
      byCategory.get(t.category)!.push(t);
    }
    const sortedOrder = [...order].sort((a, b) => {
      const aMatch = byCategory.get(a)!.some((t) => t.recommendedMode === mode);
      const bMatch = byCategory.get(b)!.some((t) => t.recommendedMode === mode);
      if (aMatch === bMatch) return 0;
      return aMatch ? -1 : 1;
    });
    return sortedOrder.map((category) => ({ category, items: byCategory.get(category)! }));
  }, [templates, mode]);

  function handleSelect(prompt: string) {
    if (hasDraft && !confirm('В поле ввода уже есть текст — заменить его шаблоном?')) return;
    onSelect(prompt);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Шаблоны промптов"
          className="h-[42px] w-[42px] shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="LayoutTemplate" size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <Command>
          {templates.length > 4 && <CommandInput placeholder="Поиск шаблона..." />}
          <CommandList>
            {loading ? (
              <div className="py-6 flex justify-center">
                <Icon name="Loader2" size={18} className="animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="py-6 px-4 text-center">
                <Icon name="LayoutTemplate" size={22} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground mb-2">У вас пока нет ни одного шаблона</p>
              </div>
            ) : (
              <>
                <CommandEmpty>Ничего не найдено</CommandEmpty>
                {groups.map((g) => (
                  <CommandGroup key={g.category} heading={g.category}>
                    {g.items.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={`${t.title} ${t.category} ${t.description}`}
                        onSelect={() => handleSelect(t.prompt)}
                        className="flex items-start gap-2 py-2"
                      >
                        <Icon name={t.icon} size={15} className="text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{t.title}</div>
                          {t.description && <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
        <div className="border-t border-border p-1.5">
          <button
            onClick={() => { setOpen(false); onManage(); }}
            className="w-full h-8 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="Settings2" size={13} />
            Управлять шаблонами
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}