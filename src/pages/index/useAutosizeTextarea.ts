import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

// Автоматически растягивает textarea по высоте контента вплоть до maxHeight (дальше появляется
// собственный скролл внутри поля) — переиспользуется в AiComposer.tsx и AiGenerateComposer.tsx,
// где раньше поле было жёстко rows=1 без возможности вырасти при вводе длинного текста.
export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement>, value: string, maxHeight: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight]);
}
