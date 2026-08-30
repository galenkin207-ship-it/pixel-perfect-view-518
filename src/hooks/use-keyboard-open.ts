import { useEffect, useRef, useState } from "react";

const isTextField = (el: Element | EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type);
  }
  return el.isContentEditable;
};

// Насколько должна "просесть" высота относительно эталонной (без клавиатуры),
// чтобы считать, что открыта экранная клавиатура.
const KEYBOARD_HEIGHT_THRESHOLD = 150;

const getViewportHeight = () => window.visualViewport?.height ?? window.innerHeight;

/**
 * Отслеживает, открыта ли сейчас экранная клавиатура. Используется, чтобы на
 * мобильных устройствах прятать фиксированное нижнее меню и плавающую
 * кнопку, пока клавиатура открыта.
 *
 * ВАЖНО: с включённым `interactive-widget=resizes-content` (см.
 * src/routes/__root.tsx) при открытии клавиатуры на Android реально
 * уменьшается сам layout viewport (window.innerHeight), а не только
 * visualViewport — это и есть корневой фикс "плавающего" меню, раньше
 * возникавшего из-за рассинхрона layout- и visual-viewport. Поэтому здесь
 * нельзя определять клавиатуру через разницу window.innerHeight и
 * visualViewport.height (после фикса они почти всегда совпадают) — вместо
 * этого мы держим "эталонную" высоту (высоту без клавиатуры) в ref и
 * сравниваем текущую высоту с ней.
 *
 * Эталон обновляется: (1) при фокусе на поле — фиксируем высоту "как есть"
 * до просадки; (2) в любой момент, когда клавиатура точно не открыта
 * (нет активного текстового поля) — чтобы учитывать смену ориентации или
 * появление/скрытие адресной строки браузера, которые тоже меняют высоту,
 * но никак не связаны с клавиатурой.
 *
 * Отдельно обрабатывается кейс, когда клавиатуру закрывают не через blur
 * (например, системной кнопкой "назад" на Android) — фокус на поле может
 * остаться, поэтому дополнительно следим за возвратом высоты к эталонной и
 * принудительно снимаем фокус с "зависшего" поля.
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  const baselineRef = useRef(0);

  useEffect(() => {
    baselineRef.current = getViewportHeight();

    const refreshBaselineIfIdle = () => {
      if (!isTextField(document.activeElement)) {
        baselineRef.current = getViewportHeight();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextField(e.target)) return;
      baselineRef.current = getViewportHeight();
      setOpen(true);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (!isTextField(e.target)) return;
      // Не мигаем меню, если фокус тут же переходит на другое текстовое
      // поле (например, Tab/Enter между полями формы).
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setOpen(false);
      }, 0);
    };

    const onViewportChange = () => {
      if (!isTextField(document.activeElement)) {
        setOpen(false);
        return;
      }
      const heightDiff = baselineRef.current - getViewportHeight();
      if (heightDiff <= KEYBOARD_HEIGHT_THRESHOLD) {
        // Высота вернулась почти к эталонной, но фокус остался на поле —
        // клавиатуру закрыли не через обычный blur (кнопка "назад" и т.п.).
        const active = document.activeElement;
        if (isTextField(active)) (active as HTMLElement).blur();
        setOpen(false);
      } else {
        setOpen(true);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("orientationchange", refreshBaselineIfIdle);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportChange);
    if (!vv) window.addEventListener("resize", onViewportChange);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("orientationchange", refreshBaselineIfIdle);
      vv?.removeEventListener("resize", onViewportChange);
      if (!vv) window.removeEventListener("resize", onViewportChange);
    };
  }, []);

  return open;
}
