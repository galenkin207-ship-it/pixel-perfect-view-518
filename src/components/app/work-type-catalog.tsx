import { useState } from "react";
import { ChevronLeft, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { WorkTypeSearchResults } from "@/components/app/work-type-search-results";
import type { CatalogType, WorkTypeDetail, WorkTypeTreeNode } from "@/data/work-type-tree";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkTypeCascade } from "@/hooks/use-work-type-cascade";
import { useWorkTypeSearch } from "@/hooks/use-work-type-search";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

const CATALOG_TYPES: { value: CatalogType; label: string }[] = [
  { value: "новое строительство", label: "Строительство" },
  { value: "ремонт", label: "Ремонт" },
];

type DeleteTarget = { id: string; label: string; parentId: string | null };

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
  onEdit,
  onDelete,
}: {
  label: string;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const itemClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Действия с позицией «${label}»`}
          className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
        >
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
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
export function WorkTypeCatalog({ className }: { className?: string }) {
  const { role, archiveWorkType } = useApp();
  const isAdminLike = role === "admin" || role === "curator";
  // Архивация на сервере разрешена только admin (PATCH /:id/archive), правка
  // и создание — admin и curator.
  const canDelete = role === "admin";
  const isMobile = useIsMobile();
  const showEditTools = isAdminLike && !isMobile;

  const [catalogType, setCatalogType] = useState<CatalogType>("новое строительство");
  const [query, setQuery] = useState("");
  const cascade = useWorkTypeCascade(catalogType);
  const search = useWorkTypeSearch(query);
  const [selectedLeafId, setSelectedLeafId] = useState<string | undefined>();
  const [editor, setEditor] = useState<WorkTypeEditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preparingCreateFor, setPreparingCreateFor] = useState<string | null>(null);

  const isSearching = query.trim().length > 0;

  function changeCatalogType(next: CatalogType) {
    if (next === catalogType) return;
    setCatalogType(next);
    cascade.reset();
    setSelectedLeafId(undefined);
  }

  // Сохранение позиции. Каскад под модалкой не размонтировался — здесь
  // только точечно перечитываем затронутые списки (refresh обновляет уже
  // открытые колонки на месте, без "Загрузки"), поэтому открытые колонки,
  // их скролл и выделенный лист остаются как были. Перенос в другую ветку:
  // карточка сразу исчезает из текущей колонки, а цепочка колонок при
  // необходимости откатывается на ближайшую валидную (см. use-work-type-cascade).
  async function handleSaved({ before, after }: WorkTypeEditorResult) {
    setEditor(null);
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
    toast.success(created ? "Позиция добавлена" : "Изменения сохранены");
    if (created) setSelectedLeafId(after.id);
    await cascade.refresh(parents, after.id);
    void search.reload();
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
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-base text-muted-foreground">
              Поиск...
            </div>
          ) : resultsCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-base text-muted-foreground">
              Ничего не найдено
            </div>
          ) : (
            <WorkTypeSearchResults
              results={search.results!}
              isAdminLike={isAdminLike}
              selectedId={selectedLeafId}
              onPick={(item) => setSelectedLeafId(item.id)}
              renderActions={
                showEditTools
                  ? (item) => (
                      <LeafActionsMenu
                        label={item.name}
                        canDelete={canDelete}
                        onEdit={() => setEditor({ kind: "edit", id: item.id })}
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
                className="flex items-center gap-1 py-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
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
              onLeaf={(leaf) => setSelectedLeafId(leaf.id)}
              renderLeafActions={
                showEditTools
                  ? (leaf, groupName) =>
                      leaf.can_edit ? (
                        <LeafActionsMenu
                          label={leafLabel(leaf, groupName)}
                          canDelete={canDelete}
                          onEdit={() => setEditor({ kind: "edit", id: leaf.id })}
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
              renderColumnFooter={
                showEditTools
                  ? ({ parent, nodes }) => {
                      if (!parent) return null;
                      const siblingLeaf = nodes.find((n) => n.level === 5);
                      const canAddHere = parent.level === 4 || (parent.level === 3 && siblingLeaf);
                      if (!canAddHere) return null;
                      return (
                        <button
                          type="button"
                          disabled={preparingCreateFor === parent.id}
                          onClick={() => void openCreate(parent, siblingLeaf)}
                          className="hidden w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-60 lg:flex"
                        >
                          <Plus className="size-4" />
                          {preparingCreateFor === parent.id ? "Открываем…" : "Добавить позицию"}
                        </button>
                      );
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {editor && (
        <WorkTypeEditorDialog
          key={editor.kind === "edit" ? `edit:${editor.id}` : "create"}
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={(result) => void handleSaved(result)}
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
