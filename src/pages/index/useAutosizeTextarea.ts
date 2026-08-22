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
// Доля высоты окна, которую поле может занять максимум. Жёсткий лимит в пикселях
// (EXPANDED_MAX_HEIGHT = 480) рассчитан на ноутбук: на телефоне с рабочей областью ~600 px такое
// поле выдавливало ленту сообщений и шапку за экран — при нажатии «увеличить поле» интерфейс
// разъезжался. Поэтому дополнительно ограничиваем поле долей видимой высоты окна.
const VIEWPORT_RATIO = 0.38;

export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement>, value: string, maxHeight: number, expanded = false) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      // Реальный потолок — меньшее из заданного лимита и доли высоты окна. Пересчитываем по
      // resize: на телефоне высота меняется при повороте экрана и появлении клавиатуры.
      const limit = Math.max(96, Math.min(maxHeight, Math.round(window.innerHeight * VIEWPORT_RATIO)));
      if (expanded) {
        el.style.height = `${limit}px`;
        return;
      }
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, limit)}px`;
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [ref, value, maxHeight, expanded]);
}