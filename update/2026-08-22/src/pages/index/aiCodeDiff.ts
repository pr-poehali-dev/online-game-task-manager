// Построчное сравнение двух версий кода для наглядного показа правок «было → стало».
// Своя реализация вместо npm-пакета: нужен ровно один алгоритм на несколько десятков строк,
// а любая diff-библиотека тянет в бандл заметно больше ради того же результата.

export type DiffKind = 'equal' | 'added' | 'removed' | 'modified';

export interface DiffRow {
  kind: DiffKind;
  /** Строка исходной версии (нет у добавленных). */
  left?: string;
  /** Строка новой версии (нет у удалённых). */
  right?: string;
  /** Номера строк для колонок — считаются отдельно, т.к. пропуски с разных сторон не совпадают. */
  leftNo?: number;
  rightNo?: number;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
}

// Наибольшая общая подпоследовательность строк. Классическая таблица длин: O(n*m) по времени и
// памяти, что для файлов из чата (сотни строк) абсолютно нормально, зато результат оптимальный —
// «жадное» сравнение по одной строке давало бы кашу из добавлений/удалений при сдвиге блока.
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

// Ограничение на размер: таблица LCS квадратична, и на огромных файлах (тысячи строк) браузер
// заметно подвиснет. Такие случаи в чате не встречаются, но защита нужна — иначе один длинный
// ответ модели подвесит вкладку.
const MAX_DIFF_LINES = 1500;

export function isDiffable(before: string, after: string): boolean {
  const a = before.split('\n').length;
  const b = after.split('\n').length;
  return a <= MAX_DIFF_LINES && b <= MAX_DIFF_LINES;
}

/**
 * Сравнивает две версии кода построчно и возвращает строки для параллельного показа.
 * Удаление и добавление, идущие подряд, схлопываются в одну строку 'modified' — так правка
 * одной строки выглядит как замена на одном уровне, а не как два разъехавшихся блока.
 */
export function diffLines(before: string, after: string): { rows: DiffRow[]; stats: DiffStats } {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  const table = lcsTable(a, b);

  const raw: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ kind: 'equal', left: a[i], right: b[j] });
      i++; j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      raw.push({ kind: 'removed', left: a[i] });
      i++;
    } else {
      raw.push({ kind: 'added', right: b[j] });
      j++;
    }
  }
  while (i < a.length) raw.push({ kind: 'removed', left: a[i++] });
  while (j < b.length) raw.push({ kind: 'added', right: b[j++] });

  // Схлопывание пар «удалено + добавлено» в 'modified'.
  const rows: DiffRow[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k];
    if (cur.kind === 'removed') {
      // Собираем идущие подряд удаления и следующие за ними добавления, чтобы сопоставить их
      // попарно: типичная правка — блок из N строк заменён на N других.
      const removed: DiffRow[] = [];
      while (k < raw.length && raw[k].kind === 'removed') removed.push(raw[k++]);
      const added: DiffRow[] = [];
      while (k < raw.length && raw[k].kind === 'added') added.push(raw[k++]);
      k--;
      const pairs = Math.min(removed.length, added.length);
      for (let p = 0; p < pairs; p++) {
        rows.push({ kind: 'modified', left: removed[p].left, right: added[p].right });
      }
      for (let p = pairs; p < removed.length; p++) rows.push(removed[p]);
      for (let p = pairs; p < added.length; p++) rows.push(added[p]);
    } else {
      rows.push(cur);
    }
  }

  const stats: DiffStats = { added: 0, removed: 0, modified: 0 };
  let leftNo = 0;
  let rightNo = 0;
  for (const row of rows) {
    if (row.left !== undefined) row.leftNo = ++leftNo;
    if (row.right !== undefined) row.rightNo = ++rightNo;
    if (row.kind === 'added') stats.added++;
    else if (row.kind === 'removed') stats.removed++;
    else if (row.kind === 'modified') stats.modified++;
  }

  return { rows, stats };
}

export interface ExtractedBlock {
  language: string | null;
  code: string;
}

/**
 * Вытаскивает ```-блоки кода из markdown-текста сообщения. Нужно, чтобы сопоставить код из
 * вопроса сотрудника с исправленной версией из ответа модели и показать их сравнением.
 */
export function extractCodeBlocks(markdown: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  const re = /```([\w+#.-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const code = m[2].replace(/\n$/, '');
    if (code.trim()) blocks.push({ language: m[1] ? m[1].toLowerCase() : null, code });
  }
  return blocks;
}

// Сообщение сотрудника часто вообще без ```: код просто вставлен текстом. Считаем такой текст
// кодом по косвенным признакам, иначе сравнивать в самом частом сценарии будет не с чем.
const CODE_HINTS = /[;{}()[\]=<>]|^\s*(def|class|function|import|from|const|let|var|public|private|if|for|while|return|SELECT|INSERT|UPDATE)\b/im;

export function looksLikeCode(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 3) return false;
  const meaningful = lines.filter((l) => l.trim());
  if (meaningful.length < 3) return false;
  const hits = meaningful.filter((l) => CODE_HINTS.test(l)).length;
  return hits / meaningful.length >= 0.5;
}

/**
 * Ищет пару «исходный код → исправленный» для сравнения: код из сообщения сотрудника и
 * подходящий блок из ответа модели. Из ответа берётся блок на том же языке с наибольшим
 * сходством — модель нередко приводит несколько блоков (пример, фрагмент, полный файл).
 */
export function findComparablePair(userText: string, assistantText: string): { before: string; after: string } | null {
  const userBlocks = extractCodeBlocks(userText);
  const before = userBlocks.length > 0
    ? userBlocks.map((b) => b.code).join('\n')
    : looksLikeCode(userText) ? userText.trim() : null;
  if (!before) return null;

  const userLanguage = userBlocks.find((b) => b.language)?.language ?? null;
  const candidates = extractCodeBlocks(assistantText).filter((b) => b.language !== 'diff');
  if (candidates.length === 0) return null;

  // Совпадение языка — самый надёжный признак «это исправленная версия»: при глубоком рефакторинге
  // от оригинала может не остаться ни одной общей строки, зато посторонние блоки (команда
  // установки в ```bash, вывод в ```text) отсекаются сразу.
  const sameLanguage = userLanguage ? candidates.filter((c) => c.language === userLanguage) : [];
  const pool = sameLanguage.length > 0 ? sameLanguage : candidates;

  // Среди блоков нужного языка выбираем наиболее похожий на оригинал, а при равенстве — самый
  // объёмный: модель часто сначала показывает проблемный фрагмент, а полное решение даёт ниже.
  const beforeLines = new Set(before.split('\n').map((l) => l.trim()).filter(Boolean));
  let best: { code: string; score: number } | null = null;
  for (const c of pool) {
    const lines = c.code.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const common = lines.filter((l) => beforeLines.has(l)).length;
    const overlap = common / Math.max(lines.length, beforeLines.size);
    // Небольшая добавка за объём — чтобы при нулевом пересечении победил содержательный блок,
    // а не однострочный фрагмент.
    const score = overlap + Math.min(lines.length, 40) / 4000;
    if (!best || score > best.score) best = { code: c.code, score };
  }
  if (!best) return null;

  // Когда язык не совпал (или его вовсе не указали), требуем ощутимого пересечения строк —
  // иначе рискуем сравнивать ответ с несвязанным примером.
  if (sameLanguage.length === 0 && best.score < 0.15) return null;
  // Слишком короткий блок при отсутствии пересечения — это, скорее всего, не исправленная версия,
  // а короткая иллюстрация к пояснению.
  if (best.code.split('\n').filter((l) => l.trim()).length < 2) return null;
  if (best.code.trim() === before.trim()) return null;
  return { before, after: best.code };
}

/**
 * Разбирает unified diff (формат ```diff со строками -/+), который модели часто присылают вместо
 * двух полных версий кода. Возвращает восстановленные версии «до» и «после», чтобы показать их
 * теми же двумя колонками. Служебные строки (@@, ---, +++) отбрасываются.
 */
export function parseUnifiedDiff(text: string): { before: string; after: string } | null {
  const lines = text.split('\n');
  const before: string[] = [];
  const after: string[] = [];
  let hasChanges = false;

  for (const line of lines) {
    if (/^(@@|---|\+\+\+|diff --git|index )/.test(line)) continue;
    if (line.startsWith('+')) {
      after.push(line.slice(1));
      hasChanges = true;
    } else if (line.startsWith('-')) {
      before.push(line.slice(1));
      hasChanges = true;
    } else {
      const context = line.startsWith(' ') ? line.slice(1) : line;
      before.push(context);
      after.push(context);
    }
  }

  if (!hasChanges) return null;
  return { before: before.join('\n'), after: after.join('\n') };
}