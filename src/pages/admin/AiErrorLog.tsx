import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { AI_URL, authHeaders } from '../index/sharedHelpers';

export interface AiErrorEntry {
  id: number;
  action: string;
  model: string | null;
  errorCode: string;
  statusCode: number | null;
  message: string | null;
  chatId: number | null;
  projectId: number | null;
  createdAt: string | null;
  userName: string;
}

// Человеческое объяснение причины. Ключ — HTTP-код ответа AI Tunnel: именно он, а не общая фраза
// «Не удалось выполнить запрос», говорит, что делать дальше.
const STATUS_HINTS: Record<number, { title: string; hint: string }> = {
  400: { title: 'Модель отклонила запрос', hint: 'Слишком длинный запрос или неподдерживаемое вложение. Переформулируйте или уменьшите файл.' },
  401: { title: 'Ключ AI Tunnel неверный', hint: 'Проверьте ключ в разделе «Служебные ключи» — он мог истечь или быть отозван.' },
  402: { title: 'Закончились деньги на AI Tunnel', hint: 'Пополните баланс аккаунта AI Tunnel — запросы не выполняются.' },
  403: { title: 'Доступ к модели закрыт', hint: 'Ключ не имеет прав на эту модель. Выберите другую модель.' },
  404: { title: 'Модель не найдена', hint: 'Модель убрали из каталога — выберите другую в списке.' },
  413: { title: 'Слишком большой запрос', hint: 'Уменьшите вложения или очистите длинную переписку.' },
  429: { title: 'Модель перегружена', hint: 'Слишком много запросов. Повтор через несколько секунд обычно проходит.' },
  500: { title: 'Сбой на стороне модели', hint: 'Временная неполадка AI Tunnel — попробуйте позже или другую модель.' },
  502: { title: 'AI Tunnel недоступен', hint: 'Нет связи с сервисом. Проверьте, что сервер имеет выход в интернет.' },
  503: { title: 'Модель временно недоступна', hint: 'Сервис на обслуживании — попробуйте другую модель.' },
  504: { title: 'Модель не ответила вовремя', hint: 'Запрос слишком тяжёлый. Сократите его или увеличьте таймаут функции.' },
};

const CODE_HINTS: Record<string, { title: string; hint: string }> = {
  aitunnel_unreachable: { title: 'Нет связи с AI Tunnel', hint: 'Сервер не смог достучаться до api.aitunnel.ru — проверьте интернет и firewall.' },
  aitunnel_not_configured: { title: 'Ключ AI Tunnel не заполнен', hint: 'Добавьте ключ в разделе «Служебные ключи».' },
  limit_exceeded: { title: 'Исчерпан месячный лимит', hint: 'Увеличьте лимит сотруднику в разделе «Команда».' },
  exception: { title: 'Сбой в коде раздела AI', hint: 'Неожиданная ошибка на сервере — покажите текст ниже разработчику.' },
  server_error: { title: 'Сбой в коде раздела AI', hint: 'Неожиданная ошибка на сервере — покажите текст ниже разработчику.' },
};

const ACTION_LABELS: Record<string, string> = {
  send_message: 'Сообщение в чате',
  project_message: 'Сессия проекта',
  generate_document: 'Сборка документа',
  generate_image: 'Генерация изображения',
  generate_video: 'Генерация видео',
  regenerate: 'Перегенерация ответа',
  project_summary: 'Описание проекта',
  generate_title: 'Название диалога',
  index_step: 'Чтение файлов',
  upload_attachment: 'Загрузка файла',
};

function explain(e: AiErrorEntry): { title: string; hint: string } {
  if (e.errorCode === 'aitunnel_error' && e.statusCode && STATUS_HINTS[e.statusCode]) {
    return STATUS_HINTS[e.statusCode];
  }
  return CODE_HINTS[e.errorCode]
    || (e.statusCode ? STATUS_HINTS[e.statusCode] : undefined)
    || { title: e.errorCode, hint: 'Точный ответ сервиса — в тексте ниже.' };
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// AiErrorLog — раздел «Ошибки AI» в кабинете. На боевом сервере логи облачной функции недоступны,
// поэтому каждая неудача пишется в базу и показывается здесь: что за действие, какая модель,
// что ДОСЛОВНО ответил AI Tunnel и что с этим делать.
export default function AiErrorLog() {
  const [entries, setEntries] = useState<AiErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AI_URL}?action=ai_errors&limit=200`, { method: 'GET', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEntries(data.entries || []);
        setCanSeeAll(!!data.canSeeAll);
      }
    } catch {
      /* ignore — покажем пустой список */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearAll() {
    setClearing(true);
    try {
      await fetch(AI_URL, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ action: 'clear_ai_errors' }),
      });
      setEntries([]);
    } catch {
      /* ignore */
    } finally {
      setClearing(false);
    }
  }

  // Сводка по причинам: сразу видно, что именно ломается чаще всего.
  const top = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const { title } = explain(e);
      map.set(title, (map.get(title) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [entries]);

  return (
    <div>
      <div className="flex items-start gap-3 mb-1">
        <h1 className="text-xl font-semibold flex-1">Ошибки AI</h1>
        <button
          onClick={load}
          title="Обновить"
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="RefreshCw" size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        {canSeeAll && entries.length > 0 && (
          <button
            onClick={clearAll}
            disabled={clearing}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
          >
            Очистить
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        {loading ? 'Загрузка…' : `${entries.length} записей · ${canSeeAll ? 'по всей команде' : 'только ваши'}`}
      </p>

      {top.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {top.map(([title, count]) => (
            <span key={title} className="px-2.5 py-1 rounded-lg bg-secondary/60 text-xs">
              {title} · <span className="text-muted-foreground">{count}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Icon name="Loader2" size={20} className="animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ошибок не было — раздел AI работает без сбоев
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const { title, hint } = explain(e);
            const open = expanded === e.id;
            return (
              <div key={e.id} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : e.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                >
                  <Icon name="TriangleAlert" size={14} className="shrink-0 text-destructive" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {ACTION_LABELS[e.action] || e.action}
                      {e.model ? ` · ${e.model}` : ''}
                      {canSeeAll ? ` · ${e.userName}` : ''}
                    </div>
                  </div>
                  {e.statusCode != null && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono bg-destructive/10 text-destructive">
                      {e.statusCode}
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtWhen(e.createdAt)}</span>
                  <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={13} className="shrink-0 text-muted-foreground" />
                </button>

                {open && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-secondary/20">
                    <div className="text-xs text-foreground/85">{hint}</div>
                    {e.message && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Ответ сервиса
                        </div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto scrollbar-thin p-2 rounded-lg bg-background border border-border">
                          {e.message}
                        </pre>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Код: {e.errorCode}
                      {e.chatId ? ` · диалог #${e.chatId}` : ''}
                      {e.projectId ? ` · проект #${e.projectId}` : ''}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
