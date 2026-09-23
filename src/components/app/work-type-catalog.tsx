import { useState } from "react";
import { ChevronLeft, Copy, Info, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkTypeCascade } from "@/components/app/work-type-cascade";
import {
  WorkTypeEditorDialog,
  type WorkTypeEditorResult,
  type WorkTypeEditorTarget,
} from "@/components/app/work-type-editor-dialog";
import { clearWorkTypeInfoCache, WorkTypeDetailsDialog } from "@/components/app/work-type-details-dialog";
import { DeleteNodeDialog, NodeNameDialog } from "@/components/app/work-type-node-dialogs";
import { WorkTypeLeafCard } from "@/components/app/work-type-leaf-card";
import { WorkTypeSearchResults, WorkTypeSearchResultsSkeleton } from "@/components/app/work-type-search-results";
import type {
  CatalogType,
  WorkTypeDetail,
  WorkTypeSearchResult,
  WorkTypeTreeNode,
} from "@/data/work-type-tree";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkTypeCascade } from "@/hooks/use-work-type-cascade";
import { useWorkTypeSearch } from "@/hooks/use-work-type-search";
import { api, ApiError } from "@/lib/api-client";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { buildWorkTypePathText } from "@/lib/work-type-format";
import { useApp } from "@/state/use-app";

const CATALOG_TYPES: { value: CatalogType; label: string }[] = [
  { value: "новое строительство", label: "Строительство" },
  { value: "ремонт", label: "Ремонт" },
];

type DeleteTarget = { id: string; label: string; parentId: string | null };

// Что создаёт «+ Добавить …» в колонке: по уровню НОВОГО контейнера (1 — сборник
// в корне каталога, 4 — группа под таблицей). Ниже группы контейнеров нет.
const NEW_NODE_LABELS: Record<number, { button: string; title: string; placeholder: string }> = {
  1: { button: "Добавить сборник", title: "Новый сборник", placeholder: "Название сборника" },
  2: { button: "Добавить раздел", title: "Новый раздел", placeholder: "Название раздела" },
  3: { button: "Добавить таблицу", title: "Новая таблица", placeholder: "Название таблицы" },
  4: { button: "Добавить группу", title: "Новая группа", placeholder: "Название группы" },
};

// Название позиции так, как её видит пользователь на карточке.
function leafLabel(leaf: { name: string; variant_label: string | null }, groupName?: string): string {
  const base = leaf.variant_label || leaf.name;
  return groupName && leaf.variant_label ? `${groupName}: ${base}` : base;
}

// Меню «⋯» на карточке листа: небольшой popover со сноской. Только десктоп
// (≥ lg). Соседствует с кнопкой карточки, а не вложено в неё, поэтому клик
// по значку карточку не выбирает.
function LeafActionsMenu({
  label,
  canDelete,
  onDetails,
  onCopyPath,
  onEdit,
  onDelete,
  subject = "позицией",
}: {
  label: string;
  canDelete: boolean;
  // Только у позиций (не у разделов): «Сведения» — самый первый пункт меню,
  // за ним «Скопировать путь».
  onDetails?: () => void;
  onCopyPath?: () => void;
  // Нет у куратора для позиций (level 5) — правка позиции только admin.
  // У контейнеров (разделы) остаётся всегда: туда попадают только через
  // showStructureTools, уже admin-only.
  onEdit?: (() => void) | undefined;
  onDelete: () => void;
  // «Действия с <subject> «…»» — позиция или раздел (контейнер).
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  const itemClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Действия с ${subject} «${label}»`}
          className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
        >
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {onDetails && (
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onDetails();
            }}
          >
            <Info className="size-4 text-muted-foreground" />
            Сведения
          </button>
        )}
        {onCopyPath && (
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onCopyPath();
            }}
          >
            <Copy className="size-4 text-muted-foreground" />
            Скопировать путь
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil className="size-4 text-muted-foreground" />
            Изменить
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={cn(itemClass, "text-destructive")}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="size-4" />
            Удалить
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Справочник видов работ для admin/curator — тот же каскад, что и в модалке
// выбора вида работ, но страницей на весь экран (browse-режим): выбор типа
// каталога, серверный поиск, а на десктопе — правка/удаление/добавление
// позиций. Один и тот же компонент для «Все виды работ» и «Управление → Виды
// работ». Высоту задаёт хозяин через className (на десктопе каскаду нужна
// определённая высота, внутри которой колонки скроллятся независимо).
//
// Для мастера (не admin/curator) тот же каскад работает только на чтение:
// вкладки, поиск, схлопывание одиночных узлов как в пикере, но без правки,
// меню «⋯», кнопок «+ Добавить …» и пустых разделов. Клик по позиции показывает
// карточку (название, единица, состав работ), цену мастер не видит.
// onAddToRecord — быстрое добавление позиции в запись (кнопка на карточке).
// Это только UI: права на каждую мутацию проверяет сервер.
export function WorkTypeCatalog({
  className,
  onAddToRecord,
}: {
  className?: string;
  onAddToRecord?: (leaf: { id: string; name: string; unit: string; price: number }) => void;
}) {
  const { role, archiveWorkType } = useApp();
  const isAdminLike = role === "admin" || role === "curator";
  const readOnly = !isAdminLike;
  // Архивация на сервере разрешена только admin (PATCH /:id/archive), правка
  // и создание — admin и curator.
  const canDelete = role === "admin";
  // Правка уже существующей позиции («Изменить» в меню «⋯») — только admin.
  // Куратор создаёт новые позиции и добавляет их в записи, но не переписывает
  // существующие (раздел/группа/состав работ).
  const canEditPosition = role === "admin";
  const isMobile = useIsMobile();
  const showEditTools = isAdminLike && !isMobile;
  // Правка структуры (разделы, таблицы, группы) — только role === "admin"
  // (не isAdminLike: куратор разделы не правит) и только десктоп.
  const showStructureTools = role === "admin" && !isMobile;

  const [catalogType, setCatalogType] = useState<CatalogType>("новое строительство");
  const [query, setQuery] = useState("");
  // Справочник (browse): auto-skip единственного ребёнка отключён — при
  // редактировании структуры виден каждый уровень. Пустые контейнеры
  // (include_empty) подгружаются только админу на десктопе; мобильная версия
  // и пикер записи их не запрашивают.
  const cascade = useWorkTypeCascade(catalogType, {
    browse: true,
    includeEmpty: showStructureTools,
    collapseSingles: readOnly,
  });
  const search = useWorkTypeSearch(query);
  const [selectedLeafId, setSelectedLeafId] = useState<string | undefined>();
  // Только чтение (мастер): выбранная позиция целиком — для карточки.
  const [selectedLeaf, setSelectedLeaf] = useState<WorkTypeTreeNode | WorkTypeSearchResult | null>(null);
  const [flashLeafIds, setFlashLeafIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<WorkTypeEditorTarget | null>(null);
  // Модалка «Сведения» (только чтение): id позиции и название с карточки.
  const [detailsTarget, setDetailsTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preparingCreateFor, setPreparingCreateFor] = useState<string | null>(null);
  const [renameNodeTarget, setRenameNodeTarget] = useState<WorkTypeTreeNode | null>(null);
  const [deleteNodeTarget, setDeleteNodeTarget] = useState<WorkTypeTreeNode | null>(null);
  // parent — родитель нового раздела (undefined — корень текущего каталога).
  const [addSectionParent, setAddSectionParent] = useState<{ parent: WorkTypeTreeNode | undefined } | null>(null);

  const isSearching = query.trim().length > 0;

  function changeCatalogType(next: CatalogType) {
    if (next === catalogType) return;
    setCatalogType(next);
    cascade.reset();
    setSelectedLeafId(undefined);
    setSelectedLeaf(null);
  }

  function pickLeaf(leaf: WorkTypeTreeNode | WorkTypeSearchResult) {
    setSelectedLeafId(leaf.id);
    if (readOnly) {
      setSelectedLeaf(leaf);
    } else {
      // Тап по самой карточке открывает «Сведения» так же, как пункт меню
      // «⋯» — и на десктопе, и на мобильном (там меню «⋯» скрыто, это
      // единственный способ посмотреть состав работ и реквизиты позиции).
      setDetailsTarget({ id: leaf.id, label: leaf.name });
    }
  }

  // Сохранение позиции. Каскад под модалкой не размонтировался — здесь
  // только точечно перечитываем затронутые списки (refresh обновляет уже
  // открытые колонки на месте, без "Загрузки"), поэтому открытые колонки,
  // их скролл и выделенный лист остаются как были. Перенос в другую ветку:
  // карточка сразу исчезает из текущей колонки, а цепочка колонок при
  // необходимости откатывается на ближайшую валидную (см. use-work-type-cascade).
  async function handleSaved({ before, after, createdIds }: WorkTypeEditorResult, opts?: { keepOpen?: boolean }) {
    const keepOpen = opts?.keepOpen ?? false;
    // Правка/перенос меняют сведения (и путь) — кэш модалки «Сведения» устарел.
    clearWorkTypeInfoCache();
    if (!keepOpen) setEditor(null);
    const created = before === null;
    const moved = before !== null && before.parent_id !== after.parent_id;
    if (moved) {
      cascade.removeNode(after.id);
      setSelectedLeafId((prev) => (prev === after.id ? undefined : prev));
    }
    const ancestorIds = (d: WorkTypeDetail | null) => (d ? d.ancestors.map((a) => a.id) : []);
    // Обычная правка меняет только список, где лежит лист. Перенос/создание
    // ещё могут опустошить старую ветку или "оживить" новую (пустые
    // контейнеры в /tree не отдаются), поэтому обновляем обе цепочки предков.
    const parents: (string | null)[] =
      moved || created
        ? [null, ...ancestorIds(before), ...ancestorIds(after)]
        : [after.parent_id];
    if (!keepOpen) {
      toast.success(
        created ? ((createdIds?.length ?? 1) > 1 ? `Позиции добавлены: ${createdIds!.length}` : "Позиция добавлена") : "Изменения сохранены",
      );
    }
    if (created) {
      // Новые позиции могут лежать в любой ветке (форма открывалась и из шапки
      // с пустым расположением): раскрываем каскад вдоль цепочки предков первой
      // созданной (списки перечитываются свежими), прокручиваем колонку к ней и
      // коротко подсвечиваем все созданные. Поиск сбрасываем — иначе каскада не видно.
      setSelectedLeafId(after.id);
      setQuery("");
      await cascade.revealPath(after.ancestors);
      // При «Сохранить и добавить ещё» форма всё ещё закрывает каскад, подсвечивать рано.
      if (!keepOpen) {
        const flashed = createdIds?.length ? createdIds : [after.id];
        setFlashLeafIds(flashed);
        setTimeout(() => setFlashLeafIds((prev) => (prev === flashed ? [] : prev)), 3000);
      }
    } else {
      await cascade.refresh(parents, after.id);
    }
    void search.reload();
  }

  // «Скопировать путь»: только запрос и буфер обмена — состояние каскада
  // (прокрутка, выбранные колонки, выбранная позиция) не трогаем.
  async function copyPath(id: string) {
    try {
      const path = await api.getWorkTypePath(id);
      if (await copyText(buildWorkTypePathText(path))) {
        toast.success("Путь скопирован");
      } else {
        toast.error("Не удалось скопировать путь, попробуйте ещё раз");
      }
    } catch {
      toast.error("Не удалось получить путь, попробуйте ещё раз");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, parentId } = deleteTarget;
    setDeleting(true);
    try {
      await archiveWorkType(id);
      cascade.removeNode(id);
      search.removeResult(id);
      setSelectedLeafId((prev) => (prev === id ? undefined : prev));
      setDeleteTarget(null);
      toast.success("Позиция удалена");
      // Группа могла опустеть и исчезнуть из списка выше — перечитываем
      // цепочку предков (только уже загруженные списки).
      void cascade.refresh([null, ...cascade.chain.map((n) => n.id), parentId]);
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 403
          ? "Удалять позиции может только администратор"
          : err instanceof ApiError && err.status === 409
            ? err.message
            : "Не удалось удалить позицию, попробуйте ещё раз",
      );
    } finally {
      setDeleting(false);
    }
  }

  // Правка структуры — из колонок каскада и из селекторов редактора позиции
  // (одни и те же обработчики). Везде точечно: перечитываем только список
  // родителя (уже загруженные колонки обновляются на месте — выбранный путь и
  // скролл остаются), без сброса каскада. parentId — реальный родитель узла
  // (null — корень каталога).
  async function handleNodeCreated(parentId: string | null) {
    await cascade.refresh([parentId], parentId ?? undefined);
  }

  async function handleNodeRenamed(id: string, name: string, parentId: string | null) {
    clearWorkTypeInfoCache(); // имя раздела входит в «Расположение» позиций
    await cascade.refresh([parentId], id);
    // Имя в выбранной цепочке (подписи над колонками, хлебные крошки).
    cascade.renameInChain(id, name);
    void search.reload();
  }

  // Узел исчезает из кэшей и колонок сразу. Если он был на открытом пути,
  // хук каскада сам сворачивает цепочку до колонки его родителя (см. эффект
  // в use-work-type-cascade) — остальные колонки, скролл и выбор не трогаются.
  async function handleNodeDeleted(id: string, parentId: string | null) {
    cascade.removeNode(id);
    void search.reload();
    await cascade.refresh([parentId]);
  }

  // «+ Добавить позицию» в конце колонки, где родитель — таблица/группа.
  // Родителем нового листа берём реального родителя соседнего листа (а не
  // выбранный в каскаде узел): бэкенд "разворачивает" группы, дублирующие имя
  // таблицы, и такой лист лежит в скрытой группе, а не прямо в таблице.
  async function openCreate(parent: WorkTypeTreeNode, siblingLeaf: WorkTypeTreeNode | undefined) {
    setPreparingCreateFor(parent.id);
    try {
      const ancestors = siblingLeaf
        ? (await api.getWorkTypeDetail(siblingLeaf.id)).ancestors
        : cascade.chain.map((n) => ({
            id: n.id,
            level: n.level,
            name: n.name,
            catalog_type: n.catalog_type,
          }));
      setEditor({ kind: "create", catalogType, ancestors });
    } catch {
      toast.error("Не удалось открыть форму, попробуйте ещё раз");
    } finally {
      setPreparingCreateFor(null);
    }
  }

  const resultsCount = search.results?.length ?? 0;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex shrink-0 rounded-xl border border-border bg-surface p-1">
          {CATALOG_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => changeCatalogType(t.value)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
                t.value === catalogType
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full rounded-xl border border-border bg-surface py-2.5 pr-4 pl-10 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {showEditTools && (
          // Общая кнопка добавления: форма создания с пустым расположением
          // (место выбирается в самой форме). Только десктоп ≥ lg.
          <button
            type="button"
            onClick={() => setEditor({ kind: "create", catalogType, ancestors: [] })}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 lg:flex"
          >
            <Plus className="size-4" />
            Добавить в справочник
          </button>
        )}
      </div>

      {isSearching && (
        <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground">
          <span className="label-caps">Справочник</span>
          <span>{search.loading ? "Поиск..." : `Найдено: ${resultsCount}`}</span>
        </div>
      )}

      {/* Десктоп-каскад: этот контейнер сам не скроллится по вертикали
          (overflow-y-hidden) — иначе все колонки делили бы один scrollTop.
          Каждая колонка скроллится независимо в границах этой области
          (см. work-type-cascade-column.tsx). Поиск и мобильный режим —
          обычный скролл. */}
      <div
        className={cn(
          "min-h-0 flex-1",
          isSearching || isMobile ? "overflow-y-auto" : "flex flex-col overflow-y-hidden",
        )}
      >
        {isSearching ? (
          search.loading ? (
            <WorkTypeSearchResultsSkeleton />
          ) : resultsCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-base text-muted-foreground">
              Ничего не найдено
            </div>
          ) : (
            <WorkTypeSearchResults
              results={search.results!}
              isAdminLike={isAdminLike}
              selectedId={selectedLeafId}
              onPick={pickLeaf}
              renderActions={
                showEditTools
                  ? (item) => (
                      <LeafActionsMenu
                        label={item.name}
                        canDelete={canDelete}
                        onDetails={() => setDetailsTarget({ id: item.id, label: item.name })}
                        onCopyPath={() => void copyPath(item.id)}
                        onEdit={
                          canEditPosition ? () => setEditor({ kind: "edit", id: item.id }) : undefined
                        }
                        onDelete={() =>
                          setDeleteTarget({ id: item.id, label: item.name, parentId: item.parent_id })
                        }
                      />
                    )
                  : undefined
              }
            />
          )
        ) : (
          <div className={cn("flex flex-col gap-2", !isMobile && "min-h-0 flex-1")}>
            {isMobile && cascade.stepBoundaries.length > 0 && (
              <button
                type="button"
                onClick={() => cascade.back()}
                className="flex items-center gap-1 py-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                Назад
              </button>
            )}
            <WorkTypeCascade
              cascade={cascade}
              mode="browse"
              isMobile={isMobile}
              isAdminLike={isAdminLike}
              selectedLeafId={selectedLeafId}
              flashLeafIds={flashLeafIds}
              collapseSingles={readOnly}
              onLeaf={pickLeaf}
              renderLeafActions={
                showEditTools
                  ? (leaf, groupName) =>
                      leaf.can_edit ? (
                        <LeafActionsMenu
                          label={leafLabel(leaf, groupName)}
                          canDelete={canDelete}
                          onDetails={() =>
                            setDetailsTarget({ id: leaf.id, label: leafLabel(leaf, groupName) })
                          }
                          onCopyPath={() => void copyPath(leaf.id)}
                          onEdit={
                            canEditPosition ? () => setEditor({ kind: "edit", id: leaf.id }) : undefined
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              id: leaf.id,
                              label: leafLabel(leaf, groupName),
                              parentId: leaf.parent_id,
                            })
                          }
                        />
                      ) : null
                  : undefined
              }
              renderContainerActions={
                showStructureTools
                  ? (node) => (
                      <LeafActionsMenu
                        label={node.name}
                        subject="разделом"
                        canDelete
                        onEdit={() => setRenameNodeTarget(node)}
                        onDelete={() => setDeleteNodeTarget(node)}
                      />
                    )
                  : undefined
              }
              renderColumnFooter={
                showEditTools
                  ? ({ parent, nodes }) => {
                      const siblingLeaf = nodes.find((n) => n.level === 5);
                      const canAddPosition =
                        parent !== undefined && (parent.level === 4 || (parent.level === 3 && siblingLeaf));
                      // Новый контейнер: в корне каталога — сборник, под узлом
                      // уровня L (L < 4) — контейнер уровня L + 1. Только admin.
                      const newLevel = parent ? parent.level + 1 : 1;
                      const canAddSection = showStructureTools && newLevel <= 4;
                      if (!canAddPosition && !canAddSection) return null;
                      const buttonClass =
                        "flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-60";
                      return (
                        <div className="hidden flex-col gap-1.5 lg:flex">
                          {canAddSection && (
                            <button
                              type="button"
                              onClick={() => setAddSectionParent({ parent })}
                              className={buttonClass}
                            >
                              <Plus className="size-4" />
                              {NEW_NODE_LABELS[newLevel]!.button}
                            </button>
                          )}
                          {canAddPosition && (
                            <button
                              type="button"
                              disabled={preparingCreateFor === parent.id}
                              onClick={() => void openCreate(parent, siblingLeaf)}
                              className={buttonClass}
                            >
                              <Plus className="size-4" />
                              {preparingCreateFor === parent.id ? "Открываем…" : "Добавить позицию"}
                            </button>
                          )}
                        </div>
                      );
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {readOnly && selectedLeaf && (
        // На телефоне карточка прилипает к нижнему краю списка над нижним меню.
        <WorkTypeLeafCard
          leaf={selectedLeaf}
          onAddToRecord={onAddToRecord ? () => onAddToRecord(selectedLeaf) : undefined}
          onClose={() => {
            setSelectedLeaf(null);
            setSelectedLeafId(undefined);
          }}
          className={isMobile ? "sticky bottom-20 z-10" : undefined}
        />
      )}

      {editor && !readOnly && (
        <WorkTypeEditorDialog
          key={editor.kind === "edit" ? `edit:${editor.id}` : "create"}
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={(result, opts) => void handleSaved(result, opts)}
          onNodeCreated={(parentId) => handleNodeCreated(parentId)}
          onNodeRenamed={(id, name, parentId) => handleNodeRenamed(id, name, parentId)}
          onNodeDeleted={(id, parentId) => handleNodeDeleted(id, parentId)}
        />
      )}

      {isAdminLike && detailsTarget && (
        <WorkTypeDetailsDialog
          key={detailsTarget.id}
          id={detailsTarget.id}
          title={detailsTarget.label}
          onClose={() => setDetailsTarget(null)}
        />
      )}

      {showStructureTools && renameNodeTarget && (
        <NodeNameDialog
          key={renameNodeTarget.id}
          title="Изменить раздел"
          initialName={renameNodeTarget.name}
          submitLabel="Сохранить"
          onClose={() => setRenameNodeTarget(null)}
          onSubmit={async (name) => {
            const node = renameNodeTarget;
            await api.renameNode(node.id, name);
            setRenameNodeTarget(null);
            toast.success("Название изменено");
            await handleNodeRenamed(node.id, name, node.parent_id);
          }}
        />
      )}

      {showStructureTools && deleteNodeTarget && (
        <DeleteNodeDialog
          key={deleteNodeTarget.id}
          node={{ id: deleteNodeTarget.id, name: deleteNodeTarget.name }}
          onClose={() => setDeleteNodeTarget(null)}
          onDeleted={async () => {
            const node = deleteNodeTarget;
            setDeleteNodeTarget(null);
            toast.success("Раздел удалён");
            await handleNodeDeleted(node.id, node.parent_id);
          }}
        />
      )}

      {showStructureTools && addSectionParent && (
        <NodeNameDialog
          key={addSectionParent.parent?.id ?? "root"}
          title={NEW_NODE_LABELS[addSectionParent.parent ? addSectionParent.parent.level + 1 : 1]!.title}
          placeholder={NEW_NODE_LABELS[addSectionParent.parent ? addSectionParent.parent.level + 1 : 1]!.placeholder}
          submitLabel="Создать"
          onClose={() => setAddSectionParent(null)}
          onSubmit={async (name) => {
            const { parent } = addSectionParent;
            await api.createWorkTypeNode({
              parentId: parent?.id ?? null,
              name,
              // Для сборника (корень) сервер требует catalog_type; у вложенных
              // узлов он наследуется от родителя.
              ...(parent ? {} : { catalogType }),
            });
            setAddSectionParent(null);
            toast.success("Раздел добавлен");
            await handleNodeCreated(parent?.id ?? null);
          }}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить позицию?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.label}» будет заархивирована и скрыта из справочника.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                // Не закрываем диалог сами — он закроется после ответа сервера.
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Удаляем…" : "Да, удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
