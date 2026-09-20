import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { CatalogType, WorkTypeTreeNode } from "@/data/work-type-tree";

export type WorkTypeTreeColumn = {
  // Ключ кэша этой колонки ("type:<каталог>" либо "parent:<id>") — по нему
  // refresh() точечно обновляет уже отрисованную колонку, не сбрасывая её
  // в состояние "Загрузка" (и, значит, не теряя позицию скролла).
  key: string;
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
  // Точечная инвалидация кэша: перечитывает списки детей только для
  // перечисленных родителей (null — корневой список текущего каталога) и,
  // если задан containingNodeId, ещё и для любого кэшированного списка, в
  // котором этот узел сейчас лежит (бэкенд "разворачивает" дублирующие
  // группы, поэтому реальный parent_id листа не всегда совпадает с ключом
  // колонки). Уже показанные колонки обновляются на месте (без состояния
  // "Загрузка"), поэтому скролл и выбор не сбрасываются.
  refresh: (parentIds: (string | null)[], containingNodeId?: string) => Promise<void>;
  // Мгновенно убирает узел из всех кэшированных списков и открытых колонок.
  removeNode: (nodeId: string) => void;
  // Свежо (мимо кэша) загружает списки детей вдоль цепочки предков листа и
  // возвращает узлы цепочки для колонок каскада. Предок, которого нет в
  // списке родителя (бэкенд схлопнул одноимённую группу — у куратора), пропускается:
  // его дети уже лежат в списке родителя.
  loadPath: (ancestors: { id: string }[]) => Promise<WorkTypeTreeNode[]>;
};

export type WorkTypeTreeOptions = {
  // Справочник admin/curator (browse), а не пикер записи: auto-skip
  // единственного ребёнка отключён (при редактировании структуры нужен
  // каждый уровень), служебные строки source='legacy_root' не показываются.
  browse?: boolean;
  // Только admin, только десктоп: дополнительно грузим пустые контейнеры
  // (GET /tree?include_empty=1, is_empty=true). Пикер записи и мобильная
  // версия этот флаг не передают.
  includeEmpty?: boolean;
};

// Один столбец на каждый уровень цепочки выбора + столбец с детьми
// последнего выбранного узла. Кэш по parentId живёт на весь срок жизни
// хука (пока открыта модалка), чтобы повторные переходы вперёд/назад
// не дёргали API заново.
export function useWorkTypeTree(
  catalogType: CatalogType | null,
  chain: WorkTypeTreeNode[],
  { browse = false, includeEmpty = false }: WorkTypeTreeOptions = {},
): UseWorkTypeTreeResult {
  const cacheRef = useRef(new Map<string, WorkTypeTreeNode[]>());
  // Режим загрузки влияет на содержимое списков — при его смене (например,
  // переключился тип указателя) кэш в прежнем режиме недействителен.
  const cacheModeRef = useRef(`${browse}:${includeEmpty}`);
  const modeKey = `${browse}:${includeEmpty}`;
  if (cacheModeRef.current !== modeKey) {
    cacheModeRef.current = modeKey;
    cacheRef.current.clear();
  }
  const optsRef = useRef({ browse, includeEmpty });
  optsRef.current = { browse, includeEmpty };

  // Единая точка загрузки списков детей: режим (include_empty, скрытие
  // legacy_root) применяется одинаково для колонок, auto-skip и refresh.
  const fetchList = useCallback(
    async (params: { type: CatalogType } | { parentId: string }): Promise<WorkTypeTreeNode[]> => {
      const { browse: isBrowse, includeEmpty: withEmpty } = optsRef.current;
      const nodes = await api.getWorkTypeTree(params, { includeEmpty: withEmpty });
      return isBrowse ? nodes.filter((node) => node.source !== "legacy_root") : nodes;
    },
    [],
  );
  const [columns, setColumns] = useState<WorkTypeTreeColumn[]>([]);
  const catalogTypeRef = useRef(catalogType);
  catalogTypeRef.current = catalogType;
  // Растёт после каждой инвалидации кэша: меняет идентичность resolveAutoSkip,
  // из-за чего колонки заново прогоняют auto-skip для своих карточек (иначе
  // карточка группы продолжала бы показывать цену/единицу уже изменённого
  // листа из старого превью).
  const [revision, setRevision] = useState(0);

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
        return cached
          ? { key, nodes: cached, loading: false }
          : { key, nodes: [], loading: true };
      }),
    );

    keys.forEach((key, index) => {
      if (cacheRef.current.has(key)) return;
      const parent = chain[index - 1];
      const fetchNodes =
        index === 0 || !parent
          ? fetchList({ type: catalogType })
          : fetchList({ parentId: parent.id });
      fetchNodes
        .then((nodes) => {
          // Режим успел смениться (тип указателя определился уже после
          // запроса) — ответ в прежнем режиме в кэш не кладём.
          if (cacheModeRef.current !== modeKey) return;
          cacheRef.current.set(key, nodes);
          if (cancelled) return;
          setColumns((prev) =>
            prev.map((col, i) => (i === index ? { key, nodes, loading: false } : col)),
          );
        })
        .catch(() => {
          if (cancelled) return;
          setColumns((prev) =>
            prev.map((col, i) => (i === index ? { key, nodes: [], loading: false } : col)),
          );
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogType, chain, modeKey]);

  const resolveAutoSkip = useCallback(async (startNode: WorkTypeTreeNode): Promise<AutoSkipResult> => {
    const chainNodes: WorkTypeTreeNode[] = [startNode];
    // Справочник: каждый уровень виден и кликабелен, ничего не схлопываем.
    if (optsRef.current.browse) return { chainNodes };
    let current = startNode;
    for (;;) {
      const key = `parent:${current.id}`;
      let children = cacheRef.current.get(key);
      if (!children) {
        try {
          children = await fetchList({ parentId: current.id });
        } catch {
          return { chainNodes };
        }
        cacheRef.current.set(key, children);
      }
      const onlyChild = children.length === 1 ? children[0] : undefined;
      if (!onlyChild) return { chainNodes };
      if (!onlyChild.has_children) {
        // Позиция без названия: карточка не сможет показать её полное имя —
        // не схлопываем, группа остаётся с шевроном, позиция — в следующей колонке.
        if (!onlyChild.name?.trim()) return { chainNodes };
        return { leaf: onlyChild, groupName: current.name };
      }
      chainNodes.push(onlyChild);
      current = onlyChild;
    }
    // revision намеренно в зависимостях: см. комментарий у useState выше.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, fetchList]);

  const refresh = useCallback(async (parentIds: (string | null)[], containingNodeId?: string) => {
    const type = catalogTypeRef.current;
    const refreshMode = cacheModeRef.current;
    const keys = new Set<string>();
    for (const id of parentIds) {
      if (id !== null) keys.add(`parent:${id}`);
      else if (type) keys.add(`type:${type}`);
    }
    if (containingNodeId) {
      cacheRef.current.forEach((nodes, key) => {
        if (nodes.some((node) => node.id === containingNodeId)) keys.add(key);
      });
    }
    // Перечитываем только то, что уже есть в кэше: непосещённые списки всё
    // равно будут загружены свежими при первом заходе.
    await Promise.all(
      [...keys]
        .filter((key) => cacheRef.current.has(key))
        .map(async (key) => {
          try {
            const nodes = key.startsWith("type:")
              ? await fetchList({ type: key.slice("type:".length) as CatalogType })
              : await fetchList({ parentId: key.slice("parent:".length) });
            if (cacheModeRef.current !== refreshMode) return;
            cacheRef.current.set(key, nodes);
            setColumns((prev) =>
              prev.map((col) => (col.key === key ? { key, nodes, loading: false } : col)),
            );
          } catch {
            // Не удалось перечитать — оставляем на экране прежний список, но
            // выкидываем его из кэша, чтобы следующий заход перечитал заново.
            cacheRef.current.delete(key);
          }
        }),
    );
    setRevision((r) => r + 1);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    cacheRef.current.forEach((nodes, key) => {
      if (nodes.some((node) => node.id === nodeId)) {
        cacheRef.current.set(
          key,
          nodes.filter((node) => node.id !== nodeId),
        );
      }
    });
    setColumns((prev) =>
      prev.map((col) =>
        col.nodes.some((node) => node.id === nodeId)
          ? { ...col, nodes: col.nodes.filter((node) => node.id !== nodeId) }
          : col,
      ),
    );
    setRevision((r) => r + 1);
  }, []);

  const loadPath = useCallback(
    async (ancestors: { id: string }[]): Promise<WorkTypeTreeNode[]> => {
      const type = catalogTypeRef.current;
      if (!type) return [];
      const mode = cacheModeRef.current;
      const remember = (key: string, nodes: WorkTypeTreeNode[]) => {
        if (cacheModeRef.current === mode) cacheRef.current.set(key, nodes);
      };
      const path: WorkTypeTreeNode[] = [];
      let list = await fetchList({ type });
      remember(`type:${type}`, list);
      for (const ancestor of ancestors) {
        const node = list.find((n) => n.id === ancestor.id);
        if (!node) continue;
        path.push(node);
        list = await fetchList({ parentId: node.id });
        remember(`parent:${node.id}`, list);
      }
      return path;
    },
    [fetchList],
  );

  return { columns, resolveAutoSkip, refresh, removeNode, loadPath };
}
