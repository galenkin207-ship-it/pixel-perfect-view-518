import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { smartFilter } from "@/lib/smart-search";
import { cn } from "@/lib/utils";

/**
 * Одиночный выбор с поиском — само поле является обычным текстовым
 * input'ом, а не отдельной кнопкой с попапом-подсказкой. Поэтому с ним
 * работаешь как с обычным текстом: клик/фокус выделяет всё значение целиком
 * (как штатное выделение в input — с "палочками"-курсорами по краям), одно
 * нажатие Backspace стирает выбор полностью, а повторный клик снимает
 * выделение и ставит курсор в конкретное место для правки по буквам —
 * это встроенное поведение браузера, отдельного кода для этого не нужно.
 *
 * Универсальная версия ObjectSelect (components/app/object-select.tsx) —
 * та привязана к WorkObject, а этот компонент используется там, где нужен
 * обычный список {id, label} с возможностью "не фильтровать" (объекты,
 * сотрудники, подавшие, виды работ в отчётах и т.п.).
 */
export function SearchableSelect({
  items,
  value,
  onChange,
  allLabel,
  searchPlaceholder,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  allLabel: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === value) ?? null;
  const filtered = useMemo(() => smartFilter(items, query, (i) => i.label), [items, query]);

  // Пока поле не редактируется, оно всегда показывает текущий выбор (или
  // пусто, если ничего не выбрано) — любая незавершённая правка при
  // закрытии отбрасывается.
  useEffect(() => {
    if (!open) setQuery(selected ? selected.label : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          placeholder={allLabel}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            // Как только текст правки перестаёт совпадать с текущим выбором
            // (в том числе стал пустым после Backspace) — сам выбор
            // снимается, начинается обычный поиск по новому тексту.
            if (value !== "" && next !== (selected ? selected.label : "")) {
              onChange("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected ? selected.label : "");
              e.currentTarget.blur();
            }
          }}
          className="w-full truncate rounded-lg border border-border bg-surface py-2 pr-20 pl-9 text-left text-sm placeholder:text-muted-foreground"
        />
        <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
          {value !== "" && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Очистить выбор"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                inputRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange("");
                  setQuery("");
                  inputRef.current?.focus();
                }
              }}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label={open ? "Свернуть список" : "Развернуть список"}
            onMouseDown={(e) => {
              console.log("[DEBUG] chevron onMouseDown, open=", open);
              e.preventDefault();
            }}
            onClick={() => {
              console.log("[DEBUG] chevron onClick FIRED, open=", open);
              if (open) {
                setOpen(false);
                inputRef.current?.blur();
              } else {
                inputRef.current?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (open) {
                  setOpen(false);
                  inputRef.current?.blur();
                } else {
                  inputRef.current?.focus();
                }
              }
            }}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          </span>
        </span>
      </div>

      {open && (
        <ul className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg md:max-h-[30rem] md:w-[200%]">
          <li>
            <button
              type="button"
              onClick={() => pick("")}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="text-muted-foreground">{allLabel}</span>
              {!value && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          </li>
          {filtered.map((i) => {
            const active = i.id === value;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => pick(active ? "" : i.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                    active && "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
                  )}
                >
                  <span className="break-words">{i.label}</span>
                  {active && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">Ничего не найдено</li>
          )}
        </ul>
      )}
    </div>
  );
}
