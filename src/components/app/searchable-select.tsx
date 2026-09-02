import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { smartFilter } from "@/lib/smart-search";
import { cn } from "@/lib/utils";

/**
 * Одиночный выбор с поиском по вводу и пунктом "Все ..." для сброса фильтра.
 * Универсальная версия ObjectSelect (components/app/object-select.tsx) —
 * та привязана к WorkObject и не умеет сбрасывать выбор, а этот компонент
 * используется там, где нужен обычный список {id, label} с возможностью
 * "не фильтровать" (объекты/сотрудники/подавшие в отчётах и т.п.).
 */
export function SearchableSelect({
  items,
  value,
  onChange,
  allLabel,
  searchPlaceholder = "Поиск...",
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

  const selected = items.find((i) => i.id === value) ?? null;
  const filtered = useMemo(() => smartFilter(items, query, (i) => i.label), [items, query]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : allLabel}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Очистить выбор"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="relative border-b border-border">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-2.5 pr-3 pl-9 text-sm outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
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
                    onClick={() => {
                      onChange(i.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
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
        </div>
      )}
    </div>
  );
}
