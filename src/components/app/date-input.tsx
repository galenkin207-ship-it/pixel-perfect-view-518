import { cn } from "@/lib/utils";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

// Обычный <input type="date"> в десктопных браузерах открывает нативный
// календарь только по клику на маленькую иконку справа — клик по остальной
// площади поля (сегменты дд/мм/гггг, паддинги) просто ставит туда курсор.
// Здесь по клику в любой точке поля принудительно вызывается showPicker(),
// чтобы вся площадь окошка была кликабельной, как ожидает пользователь.
export function DateInput({ value, onChange, className }: DateInputProps) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => {
        const input = e.currentTarget;
        if (typeof input.showPicker === "function") {
          try {
            input.showPicker();
          } catch {
            // showPicker может бросить исключение (например, если браузер
            // не поддерживает вызов в текущем состоянии) — просто игнорируем,
            // обычное поведение поля при этом не ломается.
          }
        }
      }}
      className={cn(
        "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm",
        className,
      )}
    />
  );
}
