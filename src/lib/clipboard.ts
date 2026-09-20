// Копирование текста в буфер обмена. Сначала navigator.clipboard (нужен
// secure context), при его отсутствии или отказе — запасной вариант через
// скрытый textarea и document.execCommand('copy'). Возвращает true, если
// текст скопирован.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // падаем в запасной вариант ниже
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  // Вне экрана и без прокрутки страницы к textarea при focus().
  el.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none";
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(el);
  try {
    el.focus({ preventScroll: true });
    el.select();
    el.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
    active?.focus({ preventScroll: true });
  }
}
