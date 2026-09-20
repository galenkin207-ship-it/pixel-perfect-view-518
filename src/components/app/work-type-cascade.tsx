import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { CascadeColumn } from "@/components/app/work-type-cascade-column";
import type { WorkTypeTreeNode } from "@/data/work-type-tree";
import type { WorkTypeCascadeState } from "@/hooks/use-work-type-cascade";
import { columnLabel } from "@/lib/work-type-format";

export type ColumnFooterContext = {
  // Колонка, у которой это хвост списка: родитель (undefined у корневой),
  // уровень в columns и её узлы.
  parent: WorkTypeTreeNode | undefined;
  level: number;
  nodes: WorkTypeTreeNode[];
};

// Общий каскад видов работ (Finder-колонки на десктопе, последняя колонка +
// хлебные крошки на мобильном) для двух хозяев:
//  - "select" — модалка выбора вида работ в записи: клик по листу выбирает
//    позицию;
//  - "browse" — полноэкранный справочник admin/curator: клик по листу лишь
//    подсвечивает карточку (ничего не коммитит), а на десктопе карточки могут
//    получить меню «⋯» (renderLeafActions) и хвост колонки «+ Добавить»
//    (renderColumnFooter). На мобильном эти browse-надстройки не рисуются.
// Состояние цепочки живёт снаружи (useWorkTypeCascade), чтобы переживать
// временное размонтирование каскада (счётчик, поиск).
export function WorkTypeCascade({
  cascade,
  mode,
  isMobile,
  isAdminLike,
  onLeaf,
  selectedLeafId,
  renderLeafActions,
  renderContainerActions,
  renderColumnFooter,
  flashLeafIds,
  className,
}: {
  cascade: WorkTypeCascadeState;
  mode: "select" | "browse";
  isMobile: boolean;
  isAdminLike: boolean;
  // Лист выбран (включая лист, до которого дошёл auto-skip). groupName —
  // имя его непосредственной группы (для склейки имени в select-режиме).
  onLeaf: (leaf: WorkTypeTreeNode, groupName: string | undefined) => void;
  selectedLeafId?: string | undefined;
  renderLeafActions?: ((leaf: WorkTypeTreeNode, groupName: string | undefined) => ReactNode) | undefined;
  // Меню «⋯» на карточке контейнера (уровни 1–4) — только admin.
  renderContainerActions?: ((node: WorkTypeTreeNode) => ReactNode) | undefined;
  renderColumnFooter?: ((ctx: ColumnFooterContext) => ReactNode) | undefined;
  // Позиция, к которой колонка прокручивается и которая коротко подсвечивается
  // (только что созданная, browse-режим).
  flashLeafIds?: readonly string[] | undefined;
  // Класс корня desktop-раскладки (высоту/flex задаёт хозяин).
  className?: string | undefined;
}) {
  const { chain, columns, resolveAutoSkip, frontierScrollOffset, isColumnVisible, stepBoundaries } = cascade;
  const browse = mode === "browse";
  const rowRef = useRef<HTMLDivElement>(null);
  const visibleColumnCount = columns.filter((_, level) => isColumnVisible(level)).length;
  // Пикер (select), десктоп: позиция под курсором/фокусом — для строки «Выбрано»
  // под колонками (клик по позиции сразу кладёт её в запись).
  const [previewLeaf, setPreviewLeaf] = useState<WorkTypeTreeNode | null>(null);

  // На странице справочника колонки не влезают в ширину окна (5 колонок по
  // 18rem) — при открытии новой колонки докручиваем ряд вправо, чтобы
  // свежая (и её карточки с меню «⋯») была видна. Срабатывает только когда
  // меняется число колонок, поэтому обновление списка после правки позицию
  // горизонтального скролла не трогает. В пикере (select) поведение прежнее.
  useEffect(() => {
    if (!browse || isMobile) return;
    const el = rowRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [browse, isMobile, visibleColumnCount]);

  async function handleSelectAtLevel(level: number, node: WorkTypeTreeNode, originOffsetPx: number) {
    const leaf = await cascade.selectAtLevel(level, node, originOffsetPx);
    if (leaf) onLeaf(leaf.leaf, leaf.groupName);
  }

  if (isMobile) {
    return (
      <>
        {stepBoundaries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {/* Один чип на "шаг" (клик), а не на узел — авто-схлопнутые
                промежуточные уровни отдельными чипами не показываем, чтобы
                переход по ним воспринимался как один шаг назад. */}
            {stepBoundaries.map((boundary, stepIdx) => {
              const node = chain[boundary - 1];
              if (!node) return null;
              return (
                <span key={node.id} className="flex items-center gap-1">
                  {stepIdx > 0 && <span>→</span>}
                  <button onClick={() => cascade.goToStep(stepIdx)} className="hover:text-primary hover:underline">
                    {node.name}
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <CascadeColumn
          nodes={columns[chain.length]?.nodes ?? []}
          loading={columns[chain.length]?.loading ?? true}
          selectedLeafId={browse ? selectedLeafId : undefined}
          isAdminLike={isAdminLike}
          onSelect={(node, offset) => handleSelectAtLevel(chain.length, node, offset)}
          onLeaf={(node) => onLeaf(node, chain[chain.length - 1]?.name)}
          onAutoSkipLeaf={(leaf, groupName) => onLeaf(leaf, groupName)}
          resolveAutoSkip={resolveAutoSkip}
        />
      </>
    );
  }

  return (
    <>
    <div
      ref={rowRef}
      className={className ?? "flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2"}
      onMouseLeave={browse ? undefined : () => setPreviewLeaf(null)}
    >
      {columns.map((col, level) => {
        if (!isColumnVisible(level)) return null;
        const isFrontier = level === chain.length;
        const parent = chain[level - 1];
        return (
          // Заголовок и сама колонка — в одной w-72 flex-col обёртке, а не в
          // двух синхронизируемых overflow-x-строках: так подпись скроллится
          // вместе с колонкой сама собой, без ручной синхронизации scrollLeft.
          <div key={level} className="flex w-72 shrink-0 min-h-0 flex-col">
            <div className="mb-1.5 shrink-0 px-1 text-xs font-medium text-muted-foreground">
              {columnLabel(col.nodes, parent ? parent.level + 1 : 1)}
            </div>
            <CascadeColumn
              // Без h-full: высота колонки — не CSS-процент (который не
              // резолвится против flex-item-родителя), а обычный flex
              // align-items:stretch от родителя-строки — работает всегда,
              // независимо от того, "определена" ли высота родителя в
              // терминах CSS-процентов. min-h-0 + собственный overflow-y —
              // каждая колонка скроллится независимо.
              className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
              nodes={col.nodes}
              loading={col.loading}
              scrollKey={col.key}
              selectedId={chain[level]?.id}
              selectedLeafId={browse ? selectedLeafId : undefined}
              isAdminLike={isAdminLike}
              onSelect={(node, offset) => handleSelectAtLevel(level, node, offset)}
              onLeaf={(node) => onLeaf(node, parent?.name)}
              onAutoSkipLeaf={(leaf, groupName) => onLeaf(leaf, groupName)}
              resolveAutoSkip={resolveAutoSkip}
              initialScrollTop={isFrontier ? frontierScrollOffset : undefined}
              renderLeafActions={browse ? renderLeafActions : undefined}
              renderContainerActions={browse ? renderContainerActions : undefined}
              flashIds={browse ? flashLeafIds : undefined}
              showFullLeafName={!browse}
              onPreviewLeaf={browse ? undefined : setPreviewLeaf}
              footer={browse ? renderColumnFooter?.({ parent, level, nodes: col.nodes }) : undefined}
            />
          </div>
        );
      })}
    </div>
    {!browse && (
      <p className="shrink-0 px-1 text-sm break-words text-muted-foreground">
        Выбрано: <span className="font-semibold text-foreground">{previewLeaf?.name.trim() || "—"}</span>
      </p>
    )}
    </>
  );
}
