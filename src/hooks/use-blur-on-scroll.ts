import { useEffect, type RefObject } from "react";

function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type);
  }
  return el.isContentEditable;
}

/**
 * Сворачивает экранную клавиатуру (снимает фокус с текстового поля), как
 * только пользователь начинает скроллить список внутри `target` — например,
 * список "Все виды работ" или список в диалоге выбора вида работ. Иначе
 * клавиатура закрывает часть списка и мешает читать/выбирать позиции при
 * скролле.
 *
 * `target` — либо id DOM-элемента (строка), либо ref на сам скроллящийся
 * контейнер.
 */
export function useBlurOnScroll(target: RefObject<HTMLElement | null> | string) {
  useEffect(() => {
    const el = typeof target === "string" ? document.getElementById(target) : target.current;
    if (!el) return;

    const blurActiveField = () => {
      const active = document.activeElement;
      if (isTextField(active)) active.blur();
    };

    el.addEventListener("touchmove", blurActiveField, { passive: true });
    el.addEventListener("wheel", blurActiveField, { passive: true });
    el.addEventListener("scroll", blurActiveField, { passive: true });

    return () => {
      el.removeEventListener("touchmove", blurActiveField);
      el.removeEventListener("wheel", blurActiveField);
      el.removeEventListener("scroll", blurActiveField);
    };
  }, [target]);
}
