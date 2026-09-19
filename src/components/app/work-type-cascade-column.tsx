import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ChevronRight } from "lucide-react";

import type { AutoSkipResult } from "@/hooks/use-work-type-tree";
import type { WorkTypeTreeNode } from "@/data/work-type-tree";
import { formatGesnNumberLabel } from "@/lib/work-type-format";
import { cn } from "@/lib/utils";

type AutoSkipPreview = { kind: "leaf"; leaf: WorkTypeTreeNode; groupName: string } | { kind: "branch" };

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
  initialScrollTop,
  scrollKey,
  selectedLeafId,
  renderLeafActions,
  renderContainerActions,
  flashId,
  footer,
}: {
  nodes: WorkTypeTreeNode[];
  loading: boolean;
  selectedId?: string | undefined;
  isAdminLike: boolean;
  onSelect: (node: WorkTypeTreeNode, originOffsetPx: number) => void;
  onLeaf: (node: WorkTypeTreeNode) => void;
  onAutoSkipLeaf: (leaf: WorkTypeTreeNode, groupName: string) => void;
  resolveAutoSkip: (node: WorkTypeTreeNode) => Promise<AutoSkipResult>;
  className?: string;
  // Desktop Finder-style каскад: каждая колонка скроллится независимо
  // (собственный <ul> с overflow-y-auto и ограниченной высотой — см.
  // className, который передаёт record-form.tsx). Колонка, открытая
  // кликом по карточке в проскроленной соседней колонке, должна
  // открываться выровненной по той же высоте, а не всегда с нуля.
  // Позиция в пикселях, применяется один раз, когда узлы этой колонки
  // приходят с сервера — см. эффект ниже.
  initialScrollTop?: number | undefined;
  // Что колонка сейчас показывает (ключ кэша родителя). initialScrollTop
  // применяется только когда меняется этот ключ или колонка доезжает из
  // "Загрузки" — а не при каждом обновлении массива nodes: в браузе после
  // правки позиции список перечитывается на месте (см. refresh() в
  // use-work-type-tree), и скролл при этом прыгать не должен.
  scrollKey?: string | undefined;
  // browse-режим справочника: подсвеченный лист (клик по листу ничего не
  // "коммитит"). Карточка группы, которая через auto-skip показывает этот
  // лист, подсвечивается так же.
  selectedLeafId?: string | undefined;
  // Слот справа на карточке, которая выглядит как лист (меню «⋯»). Получает
  // сам лист (для auto-skip — лист, спрятанный за карточкой группы) и имя
  // группы над ним. Клик по слоту не должен выбирать карточку — это забота
  // самого слота (карточка и слот — соседи, а не вложенные кнопки).
  renderLeafActions?: ((leaf: WorkTypeTreeNode, groupName: string | undefined) => ReactNode) | undefined;
  // Слот справа на карточке контейнера (уровни 1–4): меню «⋯» для admin.
  // Так же соседствует с кнопкой карточки, а не вложен в неё.
  renderContainerActions?: ((node: WorkTypeTreeNode) => ReactNode) | undefined;
  // Карточка, к которой нужно прокрутить колонку и коротко подсветить (только
  // что созданная позиция). Срабатывает один раз для каждого id, в той
  // колонке, где эта карточка есть.
  flashId?: string | undefined;
  // Хвост списка (кнопка «+ Добавить позицию»): рисуется и под карточками, и
  // в пустой колонке.
  footer?: ReactNode;
}) {
  const scrollRef = useRef<HTMLUListElement>(null);
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

  const [flashing, setFlashing] = useState<string | null>(null);
  const flashHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!flashId || loading || flashHandledRef.current === flashId) return;
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-node-id="${flashId}"]`);
    if (!container || !el) return;
    flashHandledRef.current = flashId;
    // Прокручиваем только саму колонку (не страницу и не ряд колонок):
    // карточка встаёт примерно по центру видимой области колонки.
    const containerRect = container.getBoundingClientRect();
    const cardRect = el.getBoundingClientRect();
    const top =
      cardRect.top - containerRect.top + container.scrollTop - (container.clientHeight - cardRect.height) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    setFlashing(flashId);
  }, [flashId, loading, nodes]);

  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => setFlashing(null), 2200);
    return () => clearTimeout(timer);
  }, [flashing]);

  useEffect(() => {
    if (!initialScrollTop || loading) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, Math.min(initialScrollTop, el.scrollHeight - el.clientHeight));
  }, [scrollKey, loading]);

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
        {footer && <div className="mt-4 text-left">{footer}</div>}
      </div>
    );
  }

  return (
    <ul ref={scrollRef} className={cn("flex flex-col gap-1.5", className)}>
      {nodes.map((node) => {
        // Контейнер — по уровню, а не по has_children: пустой контейнер
        // (include_empty, admin) детей не имеет, но остаётся контейнером —
        // по клику открывает свою (пустую) колонку.
        const isContainer = node.level < 5;
        const isEmpty = isContainer && node.is_empty;
        const preview = node.has_children ? previews[node.id] : undefined;
        const resolvesToLeaf = preview?.kind === "leaf" ? preview : undefined;
        // Карточка ведёт себя и выглядит как лист, если сам узел уже лист,
        // либо если auto-skip от него без промежуточных реальных выборов
        // доходит до листа.
        const displayAsLeaf = !isContainer || Boolean(resolvesToLeaf);
        const selected =
          node.id === selectedId ||
          (selectedLeafId != null &&
            (node.id === selectedLeafId || resolvesToLeaf?.leaf.id === selectedLeafId));
        const unit = resolvesToLeaf ? resolvesToLeaf.leaf.unit : node.unit;
        const hasPrice = resolvesToLeaf ? resolvesToLeaf.leaf.has_price : node.has_price;
        const price = resolvesToLeaf ? resolvesToLeaf.leaf.price : node.price;
        // Бэкенд отдаёт source только для листьев (level=5). Любое значение
        // кроме 'gesn_catalog' (в т.ч. legacy, user_added и отсутствие поля
        // у промежуточных узлов) считаем "своей" позицией.
        const source = resolvesToLeaf ? resolvesToLeaf.leaf.source : node.source;
        const isGesnSource = source === "gesn_catalog";
        // Первый уровень (сборники) — нумерация из gesn_code и заглавные буквы
        // визуально (CSS), без изменения самого name (используется как есть
        // в записи/отчётах).
        const isLevel1 = node.level === 1;
        const gesnNumberLabel = isLevel1 ? formatGesnNumberLabel(node.gesn_code) : null;
        const displayName = !isContainer && node.variant_label ? node.variant_label : node.name;
        const actions = displayAsLeaf
          ? renderLeafActions
            ? renderLeafActions(resolvesToLeaf ? resolvesToLeaf.leaf : node, resolvesToLeaf?.groupName)
            : null
          : renderContainerActions
            ? renderContainerActions(node)
            : null;

        return (
          // Карточка — это <li> (рамка/фон/hover), а внутри неё две соседние
          // сущности: основная кнопка и необязательный слот действий. Так
          // кнопка «⋯» не вложена в <button> и её клик не выбирает карточку.
          <li
            key={node.id}
            data-node-id={node.id}
            className={cn(
              "flex items-center rounded-xl border transition-colors",
              selected
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-surface hover:border-primary/40 hover:bg-primary/5",
              // Пустой контейнер (только admin в справочнике) — приглушённая карточка.
              isEmpty && "opacity-60",
              // Только что созданная позиция — короткая подсветка.
              flashing === node.id && "border-primary bg-primary/15 ring-2 ring-primary/40",
            )}
          >
            <button
              onClick={(event) => {
                if (resolvesToLeaf) {
                  onAutoSkipLeaf(resolvesToLeaf.leaf, resolvesToLeaf.groupName);
                } else if (isContainer) {
                  // Колонка открывается справа выровненной по высоте
                  // кликнутой карточки — но только если эту колонку
                  // реально проскроллили: иначе (клик по видимой без
                  // скролла карточке) новая колонка как и раньше
                  // открывается с нуля. Контейнер — собственный <ul> этой
                  // колонки (каждая колонка скроллится независимо).
                  //
                  // originOffsetPx — это АБСОЛЮТНАЯ позиция кликнутой
                  // карточки от начала прокручиваемого содержимого
                  // (viewport-relative offset + уже накопленный scrollTop),
                  // а не позиция внутри текущей видимой области — так,
                  // выставленный этим числом scrollTop новой колонки ставит
                  // её в ту же самую прокрученную позицию.
                  const container = scrollRef.current;
                  let originOffsetPx = 0;
                  if (container && container.scrollTop > 0) {
                    const cardRect = event.currentTarget.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    originOffsetPx = Math.max(0, cardRect.top - containerRect.top + container.scrollTop);
                  }
                  onSelect(node, originOffsetPx);
                } else {
                  onLeaf(node);
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
            >
              {/* Название получает всю оставшуюся ширину и переносится по
                  словам целиком (без truncate/line-clamp). Всё остальное —
                  бейдж источника, единица, цена, «пусто» — идёт ОТДЕЛЬНОЙ
                  строкой под названием, а не справа от него: раньше длинная
                  единица ("м2 горизонтальной проекции") отжимала название
                  в узкую полоску. Справа остаётся только шеврон контейнера.
                  Высоту карточки задаёт содержимое. */}
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className={cn(
                    "block min-w-0 text-sm font-semibold leading-snug break-words whitespace-normal",
                    isLevel1 && "uppercase",
                  )}
                >
                  {gesnNumberLabel != null ? `${gesnNumberLabel} ${displayName}` : displayName}
                </span>
                {displayAsLeaf ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase",
                        isGesnSource ? "bg-muted text-muted-foreground" : "bg-status-review-soft text-status-review",
                      )}
                    >
                      {isGesnSource ? "ГЭСН" : "Наш"}
                    </span>
                    <span className="max-w-full rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold tracking-wide break-words text-muted-foreground uppercase">
                      {unit}
                    </span>
                    {isAdminLike && (
                      <span className="font-mono text-xs break-words text-muted-foreground">
                        {hasPrice ? `${price.toLocaleString("ru-RU")} ₽ / ${unit}` : "цена не указана"}
                      </span>
                    )}
                  </span>
                ) : (
                  isEmpty && (
                    <span className="self-start rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                      пусто
                    </span>
                  )
                )}
              </span>
              {!displayAsLeaf && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            </button>
            {actions && <div className="shrink-0 pr-2">{actions}</div>}
          </li>
        );
      })}
      {footer && <li className="shrink-0">{footer}</li>}
    </ul>
  );
}
