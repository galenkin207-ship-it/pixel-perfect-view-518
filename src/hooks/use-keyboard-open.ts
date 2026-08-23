import { useEffect, useState } from "react";

/**
 * Отслеживает, находится ли сейчас в фокусе текстовое поле (input/textarea/
 * contenteditable). Используется, чтобы на мобильных устройствах прятать
 * фиксированное нижнее меню и плавающую кнопку, пока открыта экранная
 * клавиатура — иначе на iOS/Android `position: fixed`-элементы начинают
 * "уезжать" вместе со скроллом страницы, пока клавиатура не свёрнута.
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isTextField = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLInputElement) {
        return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(
          el.type,
        );
      }
      return el.isContentEditable;
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) setOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isTextField(e.target)) setOpen(false);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return open;
}
