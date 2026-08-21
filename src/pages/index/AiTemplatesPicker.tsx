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
import { PROMPT_TEMPLATES, PROMPT_TEMPLATE_CATEGORIES } from './AiPromptTemplates';
import type { AiMode } from './AiTypes';

interface AiTemplatesPickerProps {
  mode: AiMode;
  onSelect: (prompt: string) => void;
  hasDraft: boolean;
}

export default function AiTemplatesPicker({ mode, onSelect, hasDraft }: AiTemplatesPickerProps) {
  const [open, setOpen] = useState(false);

  // Категория, соответствующая текущему режиму композера (код/остальное), поднимается наверх
  // списка — сотруднику в режиме "Код" в первую очередь актуальны шаблоны код-ревью/рефакторинга,
  // а не пост в соцсети. Остальные категории идут следом в исходном порядке.
  const groups = useMemo(() => {
    const byCategory = new Map<string, typeof PROMPT_TEMPLATES>();
    for (const t of PROMPT_TEMPLATES) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category)!.push(t);
    }
    const ordered = [...PROMPT_TEMPLATE_CATEGORIES].sort((a, b) => {
      const aMatch = PROMPT_TEMPLATES.some((t) => t.category === a && t.recommendedMode === mode);
      const bMatch = PROMPT_TEMPLATES.some((t) => t.category === b && t.recommendedMode === mode);
      if (aMatch === bMatch) return 0;
      return aMatch ? -1 : 1;
    });
    return ordered
      .map((category) => ({ category, items: byCategory.get(category) || [] }))
      .filter((g) => g.items.length > 0);
  }, [mode]);

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
          <CommandInput placeholder="Поиск шаблона..." />
          <CommandList>
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
                      <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
