import type { ReactNode } from "react";

import type { WorkTypeSearchResult } from "@/data/work-type-tree";
import { cn } from "@/lib/utils";

// Результаты серверного поиска по видам работ — сетка карточек с хлебными
// крошками. Общая для модалки выбора вида работ (клик выбирает позицию) и
// справочника admin/curator (клик подсвечивает, справа — меню «⋯»).
export function WorkTypeSearchResults({
  results,
  isAdminLike,
  onPick,
  selectedId,
  renderActions,
}: {
  results: WorkTypeSearchResult[];
  isAdminLike: boolean;
  onPick: (item: WorkTypeSearchResult) => void;
  selectedId?: string | undefined;
  // Слот в правом верхнем углу карточки (меню «⋯»); соседствует с кнопкой
  // карточки, а не вложен в неё.
  renderActions?: ((item: WorkTypeSearchResult) => ReactNode) | undefined;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((t) => {
        const actions = renderActions?.(t);
        return (
          <li key={t.id} className="relative min-w-0">
            <button
              onClick={() => onPick(t)}
              className={cn(
                "group flex h-full w-full flex-col items-start justify-between gap-4 rounded-2xl border p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5",
                t.id === selectedId ? "border-primary/50 bg-primary/5" : "border-border bg-surface",
              )}
            >
              <span className={cn("block w-full", actions && "pr-8")}>
                {t.breadcrumb.length > 0 && (
                  <span className="mb-1 block truncate text-xs text-muted-foreground">
                    {t.breadcrumb.join(" → ")}
                  </span>
                )}
                <span className="block text-base font-semibold leading-snug break-words whitespace-normal group-hover:text-primary">
                  {t.name}
                </span>
              </span>
              <div className="flex w-full items-center justify-between gap-3">
                {isAdminLike ? (
                  <span className="font-mono text-sm text-muted-foreground">
                    {t.has_price ? `${t.price.toLocaleString("ru-RU")} ₽ / ${t.unit}` : "цена не указана"}
                  </span>
                ) : (
                  <span />
                )}
                <span className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.unit}
                </span>
              </div>
            </button>
            {actions && <div className="absolute top-3 right-3">{actions}</div>}
          </li>
        );
      })}
    </ul>
  );
}
