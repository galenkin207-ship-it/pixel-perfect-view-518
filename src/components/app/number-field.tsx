import { useEffect, useRef, useState } from "react";
import type { FocusEvent, InputHTMLAttributes } from "react";

/** Пока поле в фокусе, разрешаем вводить "0", "", "1,", "1.5" и т.п. — не нормализуем на каждый символ. */
const DRAFT_NUMBER_RE = /^\d*[.,]?\d*$/;

function formatNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

/**
 * Числовое поле без классического бага контролируемых <input type="number">:
 * когда пользователь стирает значение (поле становится пустым), состояние обычно
 * тут же приводится к 0, React возвращает "0" обратно в DOM, и следующая введённая
 * цифра просто дописывается к этому нулю ("05" и т.п.). Здесь во время фокуса
 * компонент хранит "черновой" текст сам и не навязывает форматирование, пока
 * пользователь не закончит ввод (blur) — а наружу отдаёт уже разобранное число.
 */
export function NumberField({
  value,
  onChange,
  onFocus,
  className,
  readOnly,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => formatNumber(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(formatNumber(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      readOnly={readOnly}
      value={text}
      onFocus={(e: FocusEvent<HTMLInputElement>) => {
        focusedRef.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!DRAFT_NUMBER_RE.test(raw)) return; // игнорируем всё, что не похоже на число
        setText(raw);

        const normalized = raw.replace(",", ".");
        if (normalized === "" || normalized === "." || normalized.endsWith(".")) return;
        const parsed = Number(normalized);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const normalized = text.replace(",", ".");
        const parsed = Number(normalized);
        const finalValue = normalized === "" || Number.isNaN(parsed) ? 0 : parsed;
        setText(formatNumber(finalValue));
        if (finalValue !== value) onChange(finalValue);
        rest.onBlur?.(e);
      }}
      className={className}
    />
  );
}
