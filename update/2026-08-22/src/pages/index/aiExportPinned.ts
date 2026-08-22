import { formatMskDateTime } from './shared';
import type { AiMessage } from './AiTypes';

// Формирует и скачивает текстовый файл со всеми закреплёнными ответами диалога — для составления
// сводки по итогам работы с ассистентом (см. AI_MANAGER_PLAN.md). Каждый ответ идёт с датой и
// использованной моделью, отделён разделителем — удобно вставить в документ или отправить коллеге.
export function exportPinnedMessages(chatTitle: string, pinnedMessages: AiMessage[]) {
  const lines: string[] = [
    `Закреплённые ответы — ${chatTitle}`,
    `Экспортировано: ${formatMskDateTime(new Date().toISOString())}`,
    '='.repeat(60),
    '',
  ];
  pinnedMessages.forEach((m, i) => {
    lines.push(`${i + 1}. ${formatMskDateTime(m.createdAt) || 'Дата неизвестна'}${m.model ? ` · ${m.model}` : ''}`);
    lines.push('-'.repeat(60));
    lines.push(m.content || '(вложение без текста)');
    if (m.attachments && m.attachments.length > 0) {
      lines.push('');
      lines.push('Вложения:');
      for (const a of m.attachments) lines.push(`- ${a.name}: ${a.url}`);
    }
    lines.push('');
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = chatTitle.replace(/[^a-zA-Zа-яА-Я0-9 _-]/g, '').trim().slice(0, 60) || 'диалог';
  a.download = `${safeTitle} — закреплённые ответы.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
