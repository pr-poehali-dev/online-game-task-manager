import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_SECONDS = 5;

interface PendingDelete<T> {
  item: T;
  secondsLeft: number;
}

/**
 * Отложенное удаление с окном отмены — вместо того чтобы стирать элемент (и слать DELETE на
 * сервер) сразу по клику, показываем на его месте плашку "Удаление через: N  Вернуть ×" на
 * UNDO_SECONDS секунд. Реальное удаление (переданный commit) вызывается только когда таймер
 * дожил до нуля; клик на "Вернуть" отменяет его и элемент остаётся как ни в чём не бывало.
 *
 * Один хук держит НЕ БОЛЕЕ ОДНОГО отложенного удаления одновременно — этого достаточно для
 * списка диалогов (см. AiChatList.tsx), где удаляют по одному через кнопку в строке. Если
 * пользователь запускает удаление второго элемента, пока не истёк таймер первого — первый
 * удаляется немедленно (commit), чтобы не плодить несколько параллельных отсчётов и не путать
 * "какой Вернуть к какому элементу относится".
 */
export function useUndoDelete<T>(commit: (item: T) => void) {
  const [pending, setPending] = useState<PendingDelete<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<PendingDelete<T> | null>(null);
  // commit передаётся как замыкание из компонента и может меняться между рендерами — держим
  // актуальную версию в ref, чтобы не пересоздавать интервал при каждом ре-рендере родителя.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishNow = useCallback((entry: PendingDelete<T> | null) => {
    if (!entry) return;
    clearTimer();
    pendingRef.current = null;
    setPending(null);
    commitRef.current(entry.item);
  }, [clearTimer]);

  // Если на момент запуска нового удаления уже шёл отсчёт по другому элементу — досрочно
  // подтверждаем предыдущее, а не бросаем его отсчёт молча (иначе оно осталось бы "подвешенным"
  // и никогда не удалилось бы, если сотрудник не откроет список снова).
  const scheduleDelete = useCallback((item: T) => {
    finishNow(pendingRef.current);
    const entry: PendingDelete<T> = { item, secondsLeft: UNDO_SECONDS };
    pendingRef.current = entry;
    setPending(entry);
    timerRef.current = setInterval(() => {
      setPending((prev) => {
        if (!prev) return prev;
        if (prev.secondsLeft <= 1) {
          clearTimer();
          pendingRef.current = null;
          commitRef.current(prev.item);
          return null;
        }
        const next = { ...prev, secondsLeft: prev.secondsLeft - 1 };
        pendingRef.current = next;
        return next;
      });
    }, 1000);
  }, [clearTimer, finishNow]);

  const undo = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, [clearTimer]);

  // При размонтировании владельца (например список диалогов закрылся) отложенное удаление
  // должно всё равно случиться, а не потеряться молча — досрочно подтверждаем то, что успело
  // накопиться в pendingRef на момент ухода.
  useEffect(() => () => {
    clearTimer();
    if (pendingRef.current) commitRef.current(pendingRef.current.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, scheduleDelete, undo };
}
