import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent, TextareaHTMLAttributes } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select не допускает пустое значение у пункта, а «— нет —» в форме —
// осознанный выбор (позиция лежит прямо под выбранным узлом). Наружу
// (onChange) пункт «нет» по-прежнему отдаётся как null.
const NONE_VALUE = "__none__";

// Общий вид поля формы редактора (тот же, что fieldClass в диалоге).
const FIELD_BOX =
  "rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60";

// Поле, которое растёт по высоте вместе с текстом (без внутренней прокрутки),
// пока не упрётся в max-h (~50% высоты окна) — только тогда появляется
// внутренняя прокрутка.
// singleLine — для полей, которые раньше были однострочным <input> (название,
// вариант): Enter не вставляет перенос, а вставленные переносы строк
// заменяются пробелом — как это делал <input>. Значение по-прежнему строка
// без переводов строки.
export const AutoTextarea = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & { rows?: number; singleLine?: boolean }
>(({ className, singleLine, rows = 1, onChange, onKeyDown, value, ...props }, forwardedRef) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastWidthRef = useRef(0);

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  const fit = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    // Сначала сбрасываем высоту, чтобы scrollHeight отражал именно текст
    // (а не прежнюю, возможно большую высоту), затем ставим по содержимому.
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    const needed = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const max = parseFloat(getComputedStyle(el).maxHeight);
    // Полоса прокрутки (со стрелками, как у числового спиннера) появляется
    // только когда текст действительно не влезает в max-h; иначе overflow
    // скрыт — округление scrollHeight на долю пикселя не рисует полосу.
    if (Number.isFinite(max) && needed > max) {
      el.style.height = `${max}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${needed}px`;
    }
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [fit, value]);

  // Ширина окна/колонки меняется — перенос строк другой, высота тоже.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidthRef.current) return;
      lastWidthRef.current = width;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={setRef}
      rows={rows}
      value={value}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        if (singleLine && /[\r\n]/.test(event.target.value)) {
          event.target.value = event.target.value.replace(/[\r\n]+/g, " ");
        }
        onChange?.(event);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (singleLine && event.key === "Enter") event.preventDefault();
        onKeyDown?.(event);
      }}
      className={cn(FIELD_BOX, "block w-full max-h-[46dvh] resize-none overflow-hidden leading-snug", className)}
      {...props}
    />
  );
});
AutoTextarea.displayName = "AutoTextarea";

export type LocationOption = { id: string; label: string };

// Селектор одного уровня блока «Расположение». Вместо нативного <select>
// (его закрытое состояние не умеет переносить текст) — Radix Select:
//  - занимает всю ширину контейнера (контейнер задаёт ширину: flex-1 min-w-0);
//  - выбранное значение показывается целиком, с переносом по словам, триггер
//    растёт по высоте;
//  - пункты списка переносят длинные названия.
export function LocationSelect({
  value,
  options,
  placeholder,
  noneLabel,
  noneDisabled,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: string | null;
  options: LocationOption[];
  // Текст, когда ничего не выбрано и «нет» невозможен (верхний уровень).
  placeholder: string;
  // Пункт «— нет —» (уровни ниже верхнего); null — пункта нет.
  noneLabel: string | null;
  noneDisabled?: boolean;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  ariaLabel: string;
}) {
  const selectValue = value ?? (noneLabel != null ? NONE_VALUE : "");
  return (
    <Select
      value={selectValue}
      disabled={disabled ?? false}
      onValueChange={(next) => onChange(next === NONE_VALUE || next === "" ? null : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          FIELD_BOX,
          "h-auto min-h-10 w-full min-w-0 items-center gap-2 whitespace-normal py-2 shadow-none [&>span]:line-clamp-none",
          "focus:ring-0",
        )}
      >
        <span className="min-w-0 flex-1 text-left">
          <SelectValue placeholder={placeholder} className="block min-w-0 whitespace-normal break-words" />
        </span>
      </SelectTrigger>
      <SelectContent className="max-w-[min(28rem,var(--radix-select-content-available-width))]">
        {noneLabel != null && (
          <SelectItem value={NONE_VALUE} disabled={noneDisabled ?? false} className="items-start whitespace-normal break-words">
            {noneLabel}
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id} className="items-start whitespace-normal break-words">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
