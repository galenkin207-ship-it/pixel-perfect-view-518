import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { CatalogType, WorkTypeTreeNode } from "@/data/work-type-tree";

export type WorkTypeTreeColumn = {
  nodes: WorkTypeTreeNode[];
  loading: boolean;
};

export type AutoSkipResult =
  | { chainNodes: WorkTypeTreeNode[] }
  | { leaf: WorkTypeTreeNode; groupName: string };

export type UseWorkTypeTreeResult = {
  columns: WorkTypeTreeColumn[];
  // Рекурсивно "доворачивает" цепочку через узлы, у которых ровно один
  // дочерний узел — используется и по клику (реальный переход), и
  // заранее, при построении колонки, чтобы решить, как отрисовать
  // карточку узла (см. work-type-cascade-column.tsx). Использует тот же
  // кэш по parentId, что и построение колонок, чтобы не дублировать запросы.
  resolveAutoSkip: (startNode: WorkTypeTreeNode) => Promise<AutoSkipResult>;
};

// Один столбец на каждый уровень цепочки выбора + столбец с детьми
// последнего выбранного узла. Кэш по parentId живёт на весь срок жизни
// хука (пока открыта модалка), чтобы повторные переходы вперёд/назад
// не дёргали API заново.
export function useWorkTypeTree(
  catalogType: CatalogType | null,
  chain: WorkTypeTreeNode[],
): UseWorkTypeTreeResult {
  const cacheRef = useRef(new Map<string, WorkTypeTreeNode[]>());
  const [columns, setColumns] = useState<WorkTypeTreeColumn[]>([]);

  useEffect(() => {
    if (!catalogType) {
      setColumns([]);
      return;
    }

    let cancelled = false;
    const keys = [`type:${catalogType}`, ...chain.map((node) => `parent:${node.id}`)];

    setColumns(
      keys.map((key) => {
        const cached = cacheRef.current.get(key);
        return cached ? { nodes: cached, loading: false } : { nodes: [], loading: true };
      }),
    );

    keys.forEach((key, index) => {
      if (cacheRef.current.has(key)) return;
      const parent = chain[index - 1];
      const fetchNodes =
        index === 0 || !parent
          ? api.getWorkTypeTree({ type: catalogType })
          : api.getWorkTypeTree({ parentId: parent.id });
      fetchNodes
        .then((nodes) => {
          cacheRef.current.set(key, nodes);
          if (cancelled) return;
          setColumns((prev) =>
            prev.map((col, i) => (i === index ? { nodes, loading: false } : col)),
          );
        })
        .catch(() => {
          if (cancelled) return;
          setColumns((prev) =>
            prev.map((col, i) => (i === index ? { nodes: [], loading: false } : col)),
          );
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogType, chain]);

  const resolveAutoSkip = useCallback(async (startNode: WorkTypeTreeNode): Promise<AutoSkipResult> => {
    const chainNodes: WorkTypeTreeNode[] = [startNode];
    let current = startNode;
    for (;;) {
      const key = `parent:${current.id}`;
      let children = cacheRef.current.get(key);
      if (!children) {
        try {
          children = await api.getWorkTypeTree({ parentId: current.id });
        } catch {
          return { chainNodes };
        }
        cacheRef.current.set(key, children);
      }
      const onlyChild = children.length === 1 ? children[0] : undefined;
      if (!onlyChild) return { chainNodes };
      if (!onlyChild.has_children) return { leaf: onlyChild, groupName: current.name };
      chainNodes.push(onlyChild);
      current = onlyChild;
    }
  }, []);

  return { columns, resolveAutoSkip };
}
