import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Icon from '@/components/ui/icon';
import { useTheme } from '@/lib/theme';
import AiCodeDiff from './AiCodeDiff';
import { parseUnifiedDiff } from './aiCodeDiff';

// Длинные ответы моделей (целый файл на 200+ строк) занимали весь экран, и до текста после кода
// приходилось долго скроллить — такие блоки сворачиваем, показывая только начало.
const COLLAPSE_THRESHOLD = 24;
const COLLAPSED_LINES = 14;

// Понятные подписи вместо сырых идентификаторов из ```-блока: модель пишет ```tsx, а сотруднику
// показываем "React TSX". Ключ — то, что реально встречается в ответах моделей.
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript', jsx: 'React JSX', javascript: 'JavaScript',
  ts: 'TypeScript', tsx: 'React TSX', typescript: 'TypeScript',
  py: 'Python', python: 'Python',
  sh: 'Terminal', bash: 'Terminal', shell: 'Terminal', zsh: 'Terminal', console: 'Terminal',
  sql: 'SQL', json: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML',
  html: 'HTML', css: 'CSS', scss: 'SCSS',
  php: 'PHP', java: 'Java', kotlin: 'Kotlin', swift: 'Swift',
  c: 'C', cpp: 'C++', 'c++': 'C++', cs: 'C#', csharp: 'C#',
  go: 'Go', rust: 'Rust', rb: 'Ruby', ruby: 'Ruby', lua: 'Lua',
  diff: 'Изменения', md: 'Markdown', markdown: 'Markdown', text: 'Текст', plaintext: 'Текст',
};

// Расширение файла для кнопки "Скачать" — чтобы сохранённый сниппет сразу открывался в редакторе
// с правильной подсветкой, а не как безымянный .txt.
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js', jsx: 'jsx', typescript: 'ts', tsx: 'tsx', python: 'py',
  bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', sql: 'sql', json: 'json',
  yaml: 'yml', yml: 'yml', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
  php: 'php', java: 'java', kotlin: 'kt', swift: 'swift', c: 'c', cpp: 'cpp',
  csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', lua: 'lua', markdown: 'md',
};

// Prism знает язык под каноническим именем — короткие псевдонимы из ответов моделей (```py,
// ```sh) без нормализации не подсвечивались бы вообще.
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash',
  zsh: 'bash', console: 'bash', yml: 'yaml', rb: 'ruby', cs: 'csharp',
  'c++': 'cpp', plaintext: 'text', md: 'markdown', golang: 'go', rs: 'rust',
};

interface AiCodeBlockProps {
  language: string | null;
  code: string;
}

export default function AiCodeBlock({ language, code }: AiCodeBlockProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [showRawDiff, setShowRawDiff] = useState(false);

  const raw = (language || '').toLowerCase();
  const prismLanguage = LANGUAGE_ALIASES[raw] || raw || 'text';
  const label = LANGUAGE_LABELS[raw] || (raw ? raw : 'Код');

  // Блок ```diff модели присылают как готовый список правок со строками -/+. Читать его в сыром
  // виде неудобно, поэтому восстанавливаем версии «до» и «после» и показываем двумя колонками.
  const unified = raw === 'diff' ? parseUnifiedDiff(code) : null;
  if (unified && !showRawDiff) {
    return (
      <div>
        <AiCodeDiff before={unified.before} after={unified.after} title="Предложенные правки" />
        <button
          onClick={() => setShowRawDiff(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-2"
        >
          <Icon name="Code2" size={11} />
          Показать в текстовом виде
        </button>
      </div>
    );
  }

  const lines = code.split('\n');
  const collapsible = lines.length > COLLAPSE_THRESHOLD;
  const shown = collapsible && !expanded ? lines.slice(0, COLLAPSED_LINES).join('\n') : code;

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    const ext = LANGUAGE_EXTENSIONS[prismLanguage] || 'txt';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/60 text-[11px] text-muted-foreground">
        <span className="font-mono">{label}</span>
        <span className="opacity-60 hidden sm:inline">· {lines.length} стр.</span>
        <div className="ml-auto flex items-center gap-2.5">
          {/* Длинные строки по умолчанию скроллятся вбок (как в редакторе кода), но иногда удобнее
              видеть всё целиком — переключатель переноса. */}
          <button
            onClick={() => setWrap((v) => !v)}
            title={wrap ? 'Не переносить длинные строки' : 'Переносить длинные строки'}
            className={`h-7 w-7 sm:h-auto sm:w-auto rounded-md flex items-center justify-center gap-1 transition-colors ${wrap ? 'text-primary' : 'hover:text-foreground'}`}
          >
            <Icon name="WrapText" size={13} />
          </button>
          <button
            onClick={handleDownload}
            title="Скачать файлом"
            className="h-7 w-7 sm:h-auto sm:w-auto rounded-md flex items-center justify-center gap-1 hover:text-foreground transition-colors"
          >
            <Icon name="Download" size={13} />
          </button>
          <button
            onClick={handleCopy}
            title="Копировать код"
            className={`h-7 px-1.5 sm:px-0 sm:h-auto rounded-md flex items-center justify-center gap-1 transition-colors ${copied ? 'text-emerald-500' : 'hover:text-foreground'}`}
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={13} />
            <span className="hidden sm:inline">{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>
      </div>
      <div className="relative">
        <SyntaxHighlighter
          language={prismLanguage}
          style={theme === 'dark' ? atomDark : oneLight}
          showLineNumbers={lines.length > 1}
          wrapLongLines={wrap}
          customStyle={{ margin: 0, fontSize: '13px', background: 'transparent' }}
          codeTagProps={{ style: { fontFamily: '"JetBrains Mono", monospace' } }}
          lineNumberStyle={{ minWidth: '2.2em', opacity: 0.35, userSelect: 'none' }}
        >
          {shown}
        </SyntaxHighlighter>
        {collapsible && !expanded && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>
      {collapsible && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-secondary/40 hover:bg-secondary/70 transition-colors flex items-center justify-center gap-1"
        >
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={12} />
          {expanded ? 'Свернуть' : `Показать целиком (${lines.length} строк)`}
        </button>
      )}
    </div>
  );
}