import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import type { AiProjectsState, AiSearchHit } from './useAiProjects';

// AiProjectSearch — вкладка «Поиск»: сотрудник ищет по СОДЕРЖИМОМУ файлов проекта, а не по их
// названиям. Работает по фрагментам, на которые разобраны документы (см. backend/ai/indexing.py),
// поэтому находит фразу внутри PDF, Word и Excel. Учитывает морфологию: «договоры» найдутся по
// запросу «договор».
export default function AiProjectSearch({ state }: { state: AiProjectsState }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AiSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Ищем с задержкой после последнего нажатия клавиши — иначе на каждый символ уходил бы запрос.
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await state.searchProject(value);
      if (!cancelled) {
        setHits(results);
        setSearched(true);
        setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, state]);

  // Подсветка найденных слов во фрагменте — так сразу видно, почему файл попал в результаты.
  function highlight(text: string) {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return text;
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(pattern).map((part, i) =>
      pattern.test(part)
        ? <mark key={i} className="bg-primary/25 text-foreground rounded px-0.5">{part}</mark>
        : part
    );
  }

  const readyFiles = state.projectFiles.filter((f) => f.indexStatus === 'ready').length;

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="relative">
        <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Найти в документах проекта…"
          className="w-full h-10 pl-9 pr-9 rounded-lg border border-border bg-secondary/40 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="X" size={14} />
          </button>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground">
        Поиск идёт по содержимому файлов, а не по названиям
        {readyFiles > 0 && ` · готово к поиску: ${readyFiles}`}
        {state.indexing && ' · часть файлов ещё обрабатывается'}
      </div>

      {searching ? (
        <div className="py-8 flex justify-center">
          <Icon name="Loader2" size={18} className="animate-spin text-primary" />
        </div>
      ) : searched && hits.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-8">
          Ничего не найдено по запросу «{query.trim()}»
        </div>
      ) : (
        <div className="space-y-2">
          {hits.map((hit) => (
            <div key={hit.chunkId} className="rounded-lg border border-border bg-card/40 p-3">
              <a
                href={hit.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium mb-1.5 hover:text-primary transition-colors"
              >
                <Icon name="File" size={12} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{hit.fileName}</span>
                <Icon name="ExternalLink" size={11} className="shrink-0 text-muted-foreground" />
              </a>
              <div className="text-xs text-foreground/80 leading-relaxed line-clamp-4">
                {highlight(hit.content)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
