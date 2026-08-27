import { useEffect, useState } from "react";

const isTextField = (el: Element | EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type);
  }
  return el.isContentEditable;
};

// Насколько должна "просесть" видимая область (visualViewport) относительно
// layout-высоты окна, чтобы считать, что открыта экранная клавиатура.
const KEYBOARD_HEIGHT_THRESHOLD = 150;

/**
 * Отслеживает, открыта ли сейчас экранная клавиатура. Используется, чтобы на
 * мобильных устройствах прятать фиксированное нижнее меню и плавающую
 * кнопку, пока клавиатура открыта — иначе на iOS/Android `position: fixed`-
 * элементы начинают "уезжать" вместе со скроллом страницы, пока клавиатура
 * не свёрнута.
 *
 * Реальное закрытие клавиатуры определяется через `visualViewport`, а не
 * только через `focusout`: на Android при сворачивании клавиатуры её
 * собственной кнопкой (или системной кнопкой "назад") фокус на поле часто
 * остаётся, `focusout` не срабатывает — из-за этого нижнее меню оставалось
 * скрытым, а в опустевшей области снизу мог появиться попап автозаполнения
 * Chrome. Как только `visualViewport` показывает, что клавиатуры физически
 * больше нет, мы дополнительно принудительно снимаем фокус с "зависшего"
 * поля.
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) setOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isTextField(e.target)) return;
      // Не мигаем меню, если фокус тут же переходит на другое текстовое
      // поле (например, Tab/Enter между полями формы).
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setOpen(false);
      }, 0);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("focusout", onFocusOut);
      };
    }

    const onViewportResize = () => {
      const heightDiff = window.innerHeight - vv.height;
      if (heightDiff <= KEYBOARD_HEIGHT_THRESHOLD) {
        const active = document.activeElement;
        if (isTextField(active)) (active as HTMLElement).blur();
        setOpen(false);
      }
    };

    vv.addEventListener("resize", onViewportResize);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv.removeEventListener("resize", onViewportResize);
    };
  }, []);

  return open;
}
