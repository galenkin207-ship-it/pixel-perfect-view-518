import { useCallback, useEffect, useState } from "react";

import type { CatalogType, WorkTypeTreeNode } from "@/data/work-type-tree";
import {
  useWorkTypeTree,
  type AutoSkipResult,
  type WorkTypeTreeOptions,
} from "@/hooks/use-work-type-tree";

// Состояние Finder-каскада видов работ (выбранная цепочка узлов + "шаги"
// для кнопки «Назад»/хлебных крошек + позиция открытия свежей колонки) поверх
// useWorkTypeTree. Живёт отдельным хуком, а не внутри компонента каскада,
// потому что хозяин каскада (пикер в record-form, страница справочника)
// иногда временно размонтирует сам каскад (карточка-счётчик, результаты
// поиска), а выбранная цепочка при этом должна сохраниться.
export function useWorkTypeCascade(catalogType: CatalogType | null, treeOptions?: WorkTypeTreeOptions) {
  const [chain, setChain] = useState<WorkTypeTreeNode[]>([]);
  // Границы "шагов" внутри chain: каждый клик пользователя (даже если он
  // авто-схлопнул несколько уровней подряд с единственным ребёнком) даёт
  // одну границу — длину chain сразу после этого клика. Так "Назад" и
  // хлебные крошки откатывают весь схлопнутый блок одним шагом, а не по
  // одному авто-пропущенному уровню за раз.
  const [stepBoundaries, setStepBoundaries] = useState<number[]>([]);
  // Desktop-каскад: вертикальная позиция (px), на которой открывается новая
  // "передовая" колонка — выровнена по кликнутой карточке в проскроленной
  // соседней колонке (см. CascadeColumn.initialScrollTop), а не всегда с нуля.
  const [frontierScrollOffset, setFrontierScrollOffset] = useState(0);
  const { columns, resolveAutoSkip, refresh, removeNode, loadPath } = useWorkTypeTree(
    catalogType,
    chain,
    treeOptions,
  );

  // Клик по карточке узла с детьми. Если auto-skip доходит до листа —
  // возвращает его (хозяин решает, что с ним делать: выбрать в запись,
  // подсветить), иначе раскрывает цепочку и возвращает null.
  const selectAtLevel = useCallback(
    async (
      level: number,
      node: WorkTypeTreeNode,
      originOffsetPx: number,
    ): Promise<Extract<AutoSkipResult, { leaf: WorkTypeTreeNode }> | null> => {
      const resolved = await resolveAutoSkip(node);
      if ("leaf" in resolved) return resolved;
      setFrontierScrollOffset(originOffsetPx);
      setChain((prev) => [...prev.slice(0, level), ...resolved.chainNodes]);
      setStepBoundaries((prev) => [
        ...prev.filter((b) => b <= level),
        level + resolved.chainNodes.length,
      ]);
      return null;
    },
    [resolveAutoSkip],
  );

  // Колонка видна, если это корневой список (не участвует в авто-пропуске),
  // ещё не выбранная "текущая" колонка (её мы всегда показываем), либо
  // граница шага — конец авто-схлопнутого блока или обычный одиночный
  // выбор. Колонки строго внутри схлопнутого блока (единственный вариант
  // на уровне) не рендерим — по ним и так некуда было бы кликать.
  const isColumnVisible = useCallback(
    (index: number): boolean => {
      if (index === 0 || index >= chain.length) return true;
      return stepBoundaries.includes(index);
    },
    [chain.length, stepBoundaries],
  );

  // false — откатывать нечего (цепочка пуста), хозяин сам решает, что
  // делать дальше (пикер возвращается к выбору типа каталога).
  const back = useCallback((): boolean => {
    if (stepBoundaries.length === 0) return false;
    const newBoundaries = stepBoundaries.slice(0, -1);
    const newLength = newBoundaries.length > 0 ? newBoundaries[newBoundaries.length - 1]! : 0;
    setStepBoundaries(newBoundaries);
    setChain((prev) => prev.slice(0, newLength));
    return true;
  }, [stepBoundaries]);

  // Хлебная крошка мобильной раскладки: вернуться на шаг stepIdx.
  const goToStep = useCallback(
    (stepIdx: number) => {
      const boundary = stepBoundaries[stepIdx];
      if (boundary == null) return;
      setChain((prev) => prev.slice(0, boundary));
      setStepBoundaries((prev) => prev.slice(0, stepIdx + 1));
    },
    [stepBoundaries],
  );

  // Раскрывает каскад справочника (browse: auto-skip выключен, каждый уровень —
  // отдельный шаг) вдоль цепочки предков листа, чтобы показать его в колонке
  // родителя. Списки вдоль цепочки перечитываются свежими.
  const revealPath = useCallback(
    async (ancestors: { id: string }[]) => {
      const nodes = await loadPath(ancestors);
      setFrontierScrollOffset(0);
      setChain(nodes);
      setStepBoundaries(nodes.map((_, i) => i + 1));
    },
    [loadPath],
  );

  // Узел выбранной цепочки переименовали: подставляем новое имя (хлебные
  // крошки, родитель в подписях). Если узла в цепочке нет — состояние не
  // меняется, ничего не перерисовывается.
  const renameInChain = useCallback((nodeId: string, name: string) => {
    setChain((prev) =>
      prev.some((node) => node.id === nodeId)
        ? prev.map((node) => (node.id === nodeId ? { ...node, name } : node))
        : prev,
    );
  }, []);

  const reset = useCallback(() => {
    setChain([]);
    setStepBoundaries([]);
    setFrontierScrollOffset(0);
  }, []);

  // После точечного refresh() узел выбранной цепочки мог пропасть из своей
  // колонки (позицию перенесли/заархивировали и группа опустела). Тогда
  // откатываемся на ближайший валидный шаг — остальные колонки левее и их
  // скролл остаются как были (те же DOM-элементы, ничего не размонтируется).
  // Проверяем только когда columns уже соответствует chain (по ключам):
  // между сменой chain и обновлением columns эффектом хука дерева есть
  // промежуточный рендер с устаревшими колонками.
  useEffect(() => {
    if (!catalogType || chain.length === 0 || columns.length !== chain.length + 1) return;
    for (let i = 0; i < chain.length; i++) {
      const col = columns[i]!;
      const expectedKey = i === 0 ? `type:${catalogType}` : `parent:${chain[i - 1]!.id}`;
      if (col.key !== expectedKey || col.loading) return;
      if (!col.nodes.some((node) => node.id === chain[i]!.id)) {
        const kept = stepBoundaries.filter((b) => b <= i);
        const newLength = kept.length > 0 ? kept[kept.length - 1]! : 0;
        setStepBoundaries(kept);
        setChain((prev) => prev.slice(0, newLength));
        return;
      }
    }
  }, [columns, chain, stepBoundaries, catalogType]);

  return {
    chain,
    stepBoundaries,
    columns,
    frontierScrollOffset,
    resolveAutoSkip,
    refresh,
    removeNode,
    renameInChain,
    revealPath,
    selectAtLevel,
    isColumnVisible,
    back,
    goToStep,
    reset,
  };
}

export type WorkTypeCascadeState = ReturnType<typeof useWorkTypeCascade>;
