import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { smartFilter } from "@/lib/smart-search";
import { cn, objectLabel } from "@/lib/utils";
import type { WorkObject } from "@/data/mock";

/**
 * Само поле — обычный текстовый input (см. searchable-select.tsx): клик
 * или фокус выделяет текущее значение целиком, Backspace стирает его сразу,
 * повторный клик снимает выделение и ставит курсор в конкретную точку для
 * правки по буквам — это штатное поведение браузера.
 */
export function ObjectSelect({
  objects,
  value,
  onChange,
  placeholder = "Выбрать объект",
}: {
  objects: WorkObject[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = objects.find((o) => o.id === value) ?? null;
  const selectedLabel = selected ? objectLabel(selected.name, selected.address) : "";
  const filtered = useMemo(
    () => smartFilter(objects, query, (o) => `${o.name} ${o.address}`),
    [objects, query],
  );

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
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
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (value !== "" && next !== selectedLabel) {
              onChange("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selectedLabel);
              e.currentTarget.blur();
            }
          }}
          className="w-full truncate rounded-xl border border-border bg-surface py-3 pr-20 pl-11 text-left text-sm placeholder:text-muted-foreground"
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) {
                setOpen(false);
              } else {
                setOpen(true);
                inputRef.current?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (open) {
                  setOpen(false);
                } else {
                  setOpen(true);
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
        <ul
          className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {filtered.map((o) => {
            const active = o.id === value;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => pick(active ? "" : o.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted",
                    active && "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
                  )}
                >
                  <span className="break-words">
                    {o.name}{" "}
                    {o.address && <span className="text-muted-foreground">· {o.address}</span>}
                  </span>
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
