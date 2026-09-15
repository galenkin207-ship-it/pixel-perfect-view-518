import { useEffect, useState } from "react";

import { ChevronRight } from "lucide-react";

import type { AutoSkipResult } from "@/hooks/use-work-type-tree";
import type { WorkTypeTreeNode } from "@/data/work-type-tree";
import { cn } from "@/lib/utils";

type AutoSkipPreview = { kind: "leaf"; leaf: WorkTypeTreeNode; groupName: string } | { kind: "branch" };

// Номер сборника (уровень 1) зашит в конце gesn_code, напр. "ГЭСН01" -> 1,
// "ГЭСНр51" -> 51. У синтетического узла "Существующие виды работ (до
// обновления)" gesn_code пустой — для него номер не показываем.
function extractGesnNumber(gesnCode: string | null): number | null {
  if (!gesnCode) return null;
  const match = /(\d+)$/.exec(gesnCode);
  return match ? Number(match[1]) : null;
}

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
  onAutoSkipLeaf,
  resolveAutoSkip,
  className,
}: {
  nodes: WorkTypeTreeNode[];
  loading: boolean;
  selectedId?: string | undefined;
  isAdminLike: boolean;
  onSelect: (node: WorkTypeTreeNode) => void;
  onLeaf: (node: WorkTypeTreeNode) => void;
  onAutoSkipLeaf: (leaf: WorkTypeTreeNode, groupName: string) => void;
  resolveAutoSkip: (node: WorkTypeTreeNode) => Promise<AutoSkipResult>;
  className?: string;
}) {
  // Заранее (на этапе построения колонки, а не по клику) прогоняем
  // auto-skip для каждого узла с детьми — чтобы решить, рисовать ли
  // карточку как промежуточную (стрелка) или как финальную (карточка
  // ведёт прямиком к листу и клик по ней мгновенно коммитит запись).
  // Пока резолвинг не завершён, карточка временно выглядит как обычный
  // intermediate-узел — это безопасный дефолт: onSelect в этом случае
  // сам прогонит тот же resolveAutoSkip и корректно обработает клик.
  const [previews, setPreviews] = useState<Record<string, AutoSkipPreview>>({});

  useEffect(() => {
    let cancelled = false;
    nodes
      .filter((node) => node.has_children)
      .forEach((node) => {
        resolveAutoSkip(node).then((result) => {
          if (cancelled) return;
          setPreviews((prev) => ({
            ...prev,
            [node.id]:
              "leaf" in result
                ? { kind: "leaf", leaf: result.leaf, groupName: result.groupName }
                : { kind: "branch" },
          }));
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, resolveAutoSkip]);

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
        const preview = node.has_children ? previews[node.id] : undefined;
        const resolvesToLeaf = preview?.kind === "leaf" ? preview : undefined;
        // Карточка ведёт себя и выглядит как лист, если сам узел уже лист,
        // либо если auto-skip от него без промежуточных реальных выборов
        // доходит до листа.
        const displayAsLeaf = !node.has_children || Boolean(resolvesToLeaf);
        const unit = resolvesToLeaf ? resolvesToLeaf.leaf.unit : node.unit;
        const hasPrice = resolvesToLeaf ? resolvesToLeaf.leaf.has_price : node.has_price;
        const price = resolvesToLeaf ? resolvesToLeaf.leaf.price : node.price;
        // Первый уровень (сборники) — нумерация из gesn_code и заглавные буквы
        // визуально (CSS), без изменения самого name (используется как есть
        // в записи/отчётах).
        const isLevel1 = node.level === 1;
        const gesnNumber = isLevel1 ? extractGesnNumber(node.gesn_code) : null;
        const displayName = !node.has_children && node.variant_label ? node.variant_label : node.name;

        return (
          <li key={node.id}>
            <button
              onClick={() => {
                if (resolvesToLeaf) {
                  onAutoSkipLeaf(resolvesToLeaf.leaf, resolvesToLeaf.groupName);
                } else if (node.has_children) {
                  onSelect(node);
                } else {
                  onLeaf(node);
                }
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-surface hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-semibold leading-snug break-words whitespace-normal",
                    isLevel1 && "uppercase",
                  )}
                >
                  {gesnNumber != null ? `${gesnNumber}. ${displayName}` : displayName}
                </span>
                {displayAsLeaf && isAdminLike && (
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {hasPrice ? `${price.toLocaleString("ru-RU")} ₽ / ${unit}` : "цена не указана"}
                  </span>
                )}
              </span>
              {displayAsLeaf ? (
                <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {unit}
                </span>
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
