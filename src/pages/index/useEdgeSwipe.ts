import { useEffect } from 'react';

// Ширина зоны у левого края, с которой начинается жест открытия панели. 24 px — компромисс:
// достаточно, чтобы попасть пальцем не глядя, и достаточно узко, чтобы не перехватывать обычные
// нажатия по интерфейсу (кнопка списка диалогов начинается с 8 px, но она обрабатывает tap, а не
// свайп, поэтому конфликта нет).
const EDGE_ZONE = 24;

// Насколько нужно протянуть палец вправо, чтобы панель открылась.
const OPEN_THRESHOLD = 60;

// Максимальное вертикальное отклонение: если палец уходит вниз сильнее, чем вправо, это прокрутка
// ленты сообщений, а не свайп — жест не засчитываем.
const MAX_VERTICAL_DRIFT = 40;

/**
 * Открытие боковой панели свайпом от ЛЕВОГО КРАЯ экрана (как в мобильных мессенджерах).
 *
 * Почему не любой свайп вправо: в разделе AI есть горизонтально прокручиваемые области — лента
 * вкладок режимов и длинные строки в блоках кода. Перехват любого горизонтального движения ломал
 * бы их прокрутку, поэтому жест считается только от самого края и дополнительно проверяется, что
 * под пальцем нет прокручиваемого вбок контейнера.
 *
 * @param enabled  включать только на телефоне — на десктопе панель постоянная
 * @param onOpen   вызывается, когда жест распознан
 */
export function useEdgeSwipe(enabled: boolean, onOpen: () => void) {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    // Если жест начат внутри блока, который сам может прокручиваться вбок (вкладки режимов,
    // блок кода), отдаём движение ему — иначе панель выезжала бы вместо прокрутки.
    function hasHorizontalScrollParent(target: EventTarget | null): boolean {
      let el = target instanceof Element ? target : null;
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth + 4) {
          const overflowX = getComputedStyle(el).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return true;
        }
        el = el.parentElement;
      }
      return false;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX > EDGE_ZONE) return;
      if (hasHorizontalScrollParent(e.target)) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dy > MAX_VERTICAL_DRIFT && dy > dx) {
        tracking = false; // это вертикальная прокрутка
        return;
      }
      if (dx >= OPEN_THRESHOLD) {
        tracking = false;
        onOpen();
      }
    }

    function onTouchEnd() {
      tracking = false;
    }

    // passive: слушатели ничего не отменяют (preventDefault не вызываем), поэтому не мешают
    // нативной прокрутке страницы.
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, onOpen]);
}
