import { Plus, X } from "lucide-react";

import type { WorkTypeTreeNode } from "@/data/work-type-tree";
import { cn } from "@/lib/utils";

// Карточка выбранной позиции в справочнике мастера (только чтение): полное
// название, единица измерения и состав работ, если он есть. Цена мастеру не
// показывается (как и в пикере записи). Клик по позиции ничего не меняет в
// данных; единственное действие — «Добавить в запись» (быстрое добавление).
export function WorkTypeLeafCard({
  leaf,
  onAddToRecord,
  onClose,
  className,
}: {
  leaf: Pick<WorkTypeTreeNode, "name" | "unit" | "work_composition">;
  onAddToRecord?: (() => void) | undefined;
  onClose: () => void;
  className?: string | undefined;
}) {
  const composition = leaf.work_composition?.trim();
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-2xl border border-primary/40 bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm leading-snug font-semibold break-words">{leaf.name.trim()}</p>
        <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase [overflow-wrap:anywhere]">
          {leaf.unit}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть карточку"
          className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {composition && (
        <div>
          <p className="label-caps">Состав работ</p>
          <p className="mt-1 max-h-28 overflow-y-auto text-sm break-words whitespace-pre-line text-muted-foreground">
            {composition}
          </p>
        </div>
      )}
      {onAddToRecord && (
        <button
          type="button"
          onClick={onAddToRecord}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="size-4" />
          Добавить в запись
        </button>
      )}
    </div>
  );
}
