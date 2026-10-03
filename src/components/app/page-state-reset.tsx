import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { isDesktopNow, resetPageState } from "@/lib/page-state";
import { cn } from "@/lib/utils";

/**
 * «Сбросить» — полный сброс сохранённого состояния страницы (фильтры, вкладки,
 * раскрытые блоки, прокрутка). Только на компьютере: на телефоне состояние и
 * так не запоминается. onReset — если часть состояния живёт в URL.
 */
export function PageStateResetButton({
  page,
  onReset,
  className,
  label = "Сбросить",
}: {
  page: string;
  onReset?: () => void;
  className?: string;
  label?: string;
}) {
  const [desktop] = useState(isDesktopNow);
  if (!desktop) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onReset?.();
        resetPageState(page);
        const el = document.getElementById("app-scroll-container");
        if (el) el.scrollTop = 0;
      }}
      title="Сбросить фильтры, вкладки, раскрытые блоки и прокрутку этой страницы"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <RotateCcw className="size-3.5" />
      {label}
    </button>
  );
}
