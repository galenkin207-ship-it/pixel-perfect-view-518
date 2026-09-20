import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { isAbortError, paramsFromKey, TreeLoader, type TreeHandle } from "@/lib/tree-loader";
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
  // Автоскип (схлопывание одиночных узлов) ТОЛЬКО по уже загруженным данным:
  // only_leaf у группы и кэш списков детей. Ничего не запрашивает.
  peekAutoSkip: (startNode: WorkTypeTreeNode) => AutoSkipResult;
  // Предзагрузка детей узла (наведение курсора на десктопе): низкий приоритет,
  // не больше 2 запросов одновременно, не мешает загрузке по клику. Возвращает
  // отмену. Для групп (level 4), листьев, справочника и уже загруженного — пусто.
  prefetchChildren: (node: WorkTypeTreeNode) => () => void;
  // Dev-замер: клик по узлу — в консоль число запросов tree, ушедших после него.
  debugClick: (label: string) => void;
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
  // Справочник мастера (только чтение): как в пикере записи схлопываем
  // одиночные узлы (only_leaf, кэш детей) и предзагружаем детей при наведении,
  // но служебные строки legacy_root по-прежнему скрыты. Только вместе с browse.
  collapseSingles?: boolean;
};

// Один столбец на каждый уровень цепочки выбора + столбец с детьми
// последнего выбранного узла. Списки живут в TreeLoader (кэш по родителю на весь
// срок жизни хука, дедупликация запросов в полёте, приоритеты, отмена) — повторные
// переходы вперёд/назад API не дёргают. Колонки вычисляются прямо при рендере из
// цепочки и кэша: клик сразу даёт новую колонку (со скелетонами), без лишнего
// рендера через эффект.
export function useWorkTypeTree(
  catalogType: CatalogType | null,
  chain: WorkTypeTreeNode[],
  { browse = false, includeEmpty = false, collapseSingles = false }: WorkTypeTreeOptions = {},
): UseWorkTypeTreeResult {
  const optsRef = useRef({ browse, includeEmpty, collapseSingles });
  optsRef.current = { browse, includeEmpty, collapseSingles };
  const catalogTypeRef = useRef(catalogType);
  catalogTypeRef.current = catalogType;
  // Растёт при каждом изменении кэша/ошибок: перерисовывает колонки и меняет
  // идентичность peekAutoSkip.
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((r) => r + 1), []);
  // Ключи, которые не удалось загрузить: колонка показывает пустой список, а не
  // вечную загрузку (повтор — при следующей смене цепочки).
  const failedRef = useRef(new Set<string>());

  const loaderRef = useRef<TreeLoader | null>(null);
  if (!loaderRef.current) {
    // Единая точка загрузки списков детей: режим (include_empty, скрытие
    // legacy_root) применяется одинаково для колонок, предзагрузки и refresh.
    loaderRef.current = new TreeLoader(async (params, signal) => {
      const { browse: isBrowse, includeEmpty: withEmpty, collapseSingles: collapse } = optsRef.current;
      const nodes = await api.getWorkTypeTree(params, { includeEmpty: withEmpty, signal });
      if (!isBrowse) return nodes;
      const visible = nodes.filter((node) => node.source !== "legacy_root");
      // Справочник admin/curator ничего не схлопывает: only_leaf (его отдаёт
      // /tree и куратору) там не используется. Справочник мастера — использует.
      return collapse ? visible : visible.map((n) => (n.only_leaf ? { ...n, only_leaf: null } : n));
    }, bump);
  }
  const loader = loaderRef.current;

  // Режим загрузки влияет на содержимое списков — при его смене (например,
  // переключился тип указателя) кэш и запросы в прежнем режиме недействительны.
  const modeKey = `${browse}:${includeEmpty}:${collapseSingles}`;
  const modeRef = useRef(modeKey);
  if (modeRef.current !== modeKey) {
    modeRef.current = modeKey;
    failedRef.current.clear();
    loader.reset();
  }

  const columns = useMemo<WorkTypeTreeColumn[]>(() => {
    if (!catalogType) return [];
    const keys = [`type:${catalogType}`, ...chain.map((node) => `parent:${node.id}`)];
    return keys.map((key) => {
      const cached = loader.cache.get(key);
      if (cached) return { key, nodes: cached, loading: false };
      return { key, nodes: [], loading: !failedRef.current.has(key) };
    });
    // revision — изменился кэш или набор ошибок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogType, chain, revision, loader]);

  // Загрузка колонок цепочки, которых ещё нет в кэше (высокий приоритет). При
  // смене цепочки запросы колонок, которые больше не нужны (ушли в другую ветку),
  // отменяются; нужные подхватываются заново тем же запросом.
  useEffect(() => {
    if (!catalogType) return;
    let cancelled = false;
    const handles: TreeHandle[] = [];
    const keys = [`type:${catalogType}`, ...chain.map((node) => `parent:${node.id}`)];
    keys.forEach((key, index) => {
      if (failedRef.current.delete(key)) bump();
      if (loader.cache.has(key)) return;
      const parent = chain[index - 1];
      const handle = loader.load(index === 0 || !parent ? { type: catalogType } : { parentId: parent.id }, {
        priority: "high",
      });
      handles.push(handle);
      handle.promise.catch((err) => {
        if (cancelled || isAbortError(err)) return;
        failedRef.current.add(key);
        bump();
      });
    });
    return () => {
      cancelled = true;
      handles.forEach((h) => h.release());
    };
  }, [catalogType, chain, modeKey, loader, bump]);

  const peekAutoSkip = useCallback(
    (startNode: WorkTypeTreeNode): AutoSkipResult => {
      const chainNodes: WorkTypeTreeNode[] = [startNode];
      // Справочник admin/curator: каждый уровень виден и кликабелен, ничего не
      // схлопываем.
      if (optsRef.current.browse && !optsRef.current.collapseSingles) return { chainNodes };
      let current = startNode;
      for (;;) {
        // Группа с единственной позицией: позиция уже пришла в only_leaf.
        // Позиция без названия не годится — карточка показывает её полное имя.
        if (current.only_leaf?.name?.trim()) return { leaf: current.only_leaf, groupName: current.name };
        const children = loader.cache.get(`parent:${current.id}`);
        if (!children) return { chainNodes };
        const onlyChild = children.length === 1 ? children[0] : undefined;
        if (!onlyChild) return { chainNodes };
        if (!onlyChild.has_children) {
          if (!onlyChild.name?.trim()) return { chainNodes };
          return { leaf: onlyChild, groupName: current.name };
        }
        chainNodes.push(onlyChild);
        current = onlyChild;
      }
    },
    // revision намеренно в зависимостях: см. комментарий у useState выше.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, loader],
  );

  const prefetchChildren = useCallback(
    (node: WorkTypeTreeNode): (() => void) => {
      if (optsRef.current.browse && !optsRef.current.collapseSingles) return () => {};
      if (node.level >= 4 || !node.has_children) return () => {};
      if (loader.cache.has(`parent:${node.id}`)) return () => {};
      const handle = loader.load({ parentId: node.id }, { priority: "low" });
      handle.promise.catch(() => {});
      return handle.release;
    },
    [loader],
  );

  const debugClick = useCallback((label: string) => loader.debugClick(label), [loader]);

  const refresh = useCallback(
    async (parentIds: (string | null)[], containingNodeId?: string) => {
      const type = catalogTypeRef.current;
      const keys = new Set<string>();
      for (const id of parentIds) {
        if (id !== null) keys.add(`parent:${id}`);
        else if (type) keys.add(`type:${type}`);
      }
      if (containingNodeId) {
        loader.cache.forEach((nodes, key) => {
          if (nodes.some((node) => node.id === containingNodeId)) keys.add(key);
        });
      }
      // Перечитываем только то, что уже есть в кэше: непосещённые списки всё
      // равно будут загружены свежими при первом заходе. fresh — мимо запросов в
      // полёте (они могли начаться до записи). Не удалось перечитать — на экране
      // остаётся прежний список.
      await Promise.all(
        [...keys]
          .filter((key) => loader.cache.has(key))
          .map(async (key) => {
            try {
              await loader.load(paramsFromKey(key), { priority: "high", fresh: true }).promise;
            } catch {
              /* оставляем прежний список */
            }
          }),
      );
      bump();
    },
    [loader, bump],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      loader.cache.forEach((nodes, key) => {
        if (nodes.some((node) => node.id === nodeId)) {
          loader.cache.set(
            key,
            nodes.filter((node) => node.id !== nodeId),
          );
        }
      });
      bump();
    },
    [loader, bump],
  );

  const loadPath = useCallback(
    async (ancestors: { id: string }[]): Promise<WorkTypeTreeNode[]> => {
      const type = catalogTypeRef.current;
      if (!type) return [];
      const path: WorkTypeTreeNode[] = [];
      let list = await loader.load({ type }, { priority: "high", fresh: true }).promise;
      for (const ancestor of ancestors) {
        const node = list.find((n) => n.id === ancestor.id);
        if (!node) continue;
        path.push(node);
        list = await loader.load({ parentId: node.id }, { priority: "high", fresh: true }).promise;
      }
      return path;
    },
    [loader],
  );

  return { columns, peekAutoSkip, prefetchChildren, debugClick, refresh, removeNode, loadPath };
}
