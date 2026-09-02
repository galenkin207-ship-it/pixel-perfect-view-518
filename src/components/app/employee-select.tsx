import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export function EmployeeSelect({
  all,
  value,
  onChange,
  placeholder = "Добавить сотрудника",
}: {
  all: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => all.filter((e) => e.toLowerCase().includes(query.trim().toLowerCase())),
    [all, query],
  );

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        {value.map((e) => (
          <span
            key={e}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            {e}
            <button
              type="button"
              onClick={() => toggle(e)}
              aria-label={`Убрать ${e}`}
              className="opacity-80 hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-primary"
        >
          {placeholder}
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="relative border-b border-border">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Backspace на пустом поле поиска убирает последнего
                // добавленного сотрудника — удобно на телефоне, не нужно
                // точно попадать по крестику на маленьком чипе.
                if (e.key === "Backspace" && query === "" && value.length > 0) {
                  onChange(value.slice(0, -1));
                }
              }}
              placeholder="Поиск сотрудника..."
              className="w-full bg-transparent py-3 pr-3 pl-9 text-sm outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            {filtered.map((e) => {
              const active = value.includes(e);
              return (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => toggle(e)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted",
                      active && "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
                    )}
                  >
                    <span className="break-words">{e}</span>
                    {active && <Check className="size-4 text-primary" />}
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