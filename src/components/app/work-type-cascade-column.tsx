import { ChevronRight } from "lucide-react";

import type { WorkTypeTreeNode } from "@/data/work-type-tree";
import { cn } from "@/lib/utils";

// Один уровень каскада: список узлов дерева видов работ. Используется и как
// колонка в desktop-раскладке (Finder column view), и как единственный
// экран в mobile-раскладке.
export function CascadeColumn({
  nodes,
  loading,
  selectedId,
  isAdminLike,
  onSelect,
  onLeaf,
  className,
}: {
  nodes: WorkTypeTreeNode[];
  loading: boolean;
  selectedId?: string | undefined;
  isAdminLike: boolean;
  onSelect: (node: WorkTypeTreeNode) => void;
  onLeaf: (node: WorkTypeTreeNode) => void;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-8 text-sm text-muted-foreground", className)}>
        Загрузка...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={cn("p-8 text-center text-sm text-muted-foreground", className)}>
        Здесь пока пусто
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {nodes.map((node) => {
        const selected = node.id === selectedId;
        return (
          <li key={node.id}>
            <button
              onClick={() => (node.has_children ? onSelect(node) : onLeaf(node))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-surface hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug break-words whitespace-normal">
                  {node.name}
                </span>
                {!node.has_children && isAdminLike && (
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {node.has_price
                      ? `${node.price.toLocaleString("ru-RU")} ₽ / ${node.unit}`
                      : "цена не указана"}
                  </span>
                )}
              </span>
              {node.has_children ? (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {node.unit}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
