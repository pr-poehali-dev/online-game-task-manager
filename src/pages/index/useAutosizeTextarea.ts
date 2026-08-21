import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

// Автоматически растягивает textarea по высоте контента вплоть до maxHeight (дальше появляется
// собственный скролл внутри поля) — переиспользуется в AiComposer.tsx и AiGenerateComposer.tsx,
// где раньше поле было жёстко rows=1 без возможности вырасти при вводе длинного текста.
//
// expanded — принудительно растягивает поле сразу до maxHeight, даже если текста мало: без этого
// нажатие кнопки "Увеличить поле" визуально ничего не меняло при коротком/пустом черновике, т.к.
// высота считалась только от scrollHeight контента (min(scrollHeight, maxHeight)), а не от самого
// факта разворота.
export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement>, value: string, maxHeight: number, expanded = false) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) {
      el.style.height = `${maxHeight}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight, expanded]);
}