import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ru } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DateInput({ value, onChange, className }: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span>{selected ? selected.toLocaleDateString("ru-RU") : "дд.мм.гггг"}</span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ru}
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          onSelect={(date) => {
            onChange(date ? toIso(date) : "");
            setOpen(false);
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(todayIso());
              setOpen(false);
            }}
          >
            Сегодня
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Сбросить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
