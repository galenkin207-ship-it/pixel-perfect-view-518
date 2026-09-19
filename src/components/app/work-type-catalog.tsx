import { useState } from "react";
import { ChevronLeft, Search } from "lucide-react";

import { WorkTypeCascade } from "@/components/app/work-type-cascade";
import { WorkTypeSearchResults } from "@/components/app/work-type-search-results";
import type { CatalogType } from "@/data/work-type-tree";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkTypeCascade } from "@/hooks/use-work-type-cascade";
import { useWorkTypeSearch } from "@/hooks/use-work-type-search";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

const CATALOG_TYPES: { value: CatalogType; label: string }[] = [
  { value: "новое строительство", label: "Строительство" },
  { value: "ремонт", label: "Ремонт" },
];

// Справочник видов работ для admin/curator — тот же каскад, что и в модалке
// выбора вида работ, но страницей на весь экран (browse-режим): выбор типа
// каталога, серверный поиск, клик по листу лишь подсвечивает карточку. Один и
// тот же компонент для «Все виды работ» и «Управление → Виды работ». Высоту
// задаёт хозяин через className (на десктопе каскаду нужна определённая
// высота, внутри которой колонки скроллятся независимо).
export function WorkTypeCatalog({ className }: { className?: string }) {
  const { role } = useApp();
  const isAdminLike = role === "admin" || role === "curator";
  const isMobile = useIsMobile();

  const [catalogType, setCatalogType] = useState<CatalogType>("новое строительство");
  const [query, setQuery] = useState("");
  const cascade = useWorkTypeCascade(catalogType);
  const search = useWorkTypeSearch(query);
  const [selectedLeafId, setSelectedLeafId] = useState<string | undefined>();

  const isSearching = query.trim().length > 0;

  function changeCatalogType(next: CatalogType) {
    if (next === catalogType) return;
    setCatalogType(next);
    cascade.reset();
    setSelectedLeafId(undefined);
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
