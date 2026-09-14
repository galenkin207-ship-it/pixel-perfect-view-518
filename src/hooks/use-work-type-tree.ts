import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { CatalogType, WorkTypeTreeNode } from "@/data/work-type-tree";

export type WorkTypeTreeColumn = {
  nodes: WorkTypeTreeNode[];
  loading: boolean;
};

// Один столбец на каждый уровень цепочки выбора + столбец с детьми
// последнего выбранного узла. Кэш по parentId живёт на весь срок жизни
// хука (пока открыта модалка), чтобы повторные переходы вперёд/назад
// не дёргали API заново.
export function useWorkTypeTree(
  catalogType: CatalogType | null,
  chain: WorkTypeTreeNode[],
): WorkTypeTreeColumn[] {
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

  return columns;
}
