import { createFileRoute, Link } from "@tanstack/react-router";
import { ImageIcon, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { StatusBadge } from "@/components/app/status-badge";
import { itemQty } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import { statusLabels, type RecordStatus } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/reports/all")({
  head: () => ({
    meta: [
      { title: "Все записи — Учёт работ" },
      {
        name: "description",
        content:
          "Таблица всех выполненных работ по объектам с фильтрами по подавшему, дате и статусу.",
      },
      { property: "og:title", content: "Все записи — Учёт работ" },
      { property: "og:description", content: "Реестр выполненных работ строительной компании." },
    ],
  }),
  component: AllRecordsPage,
});

function AllRecordsPage() {
  const { records, objects } = useApp();
  const [objectId, setObjectId] = useState("all");
  const [status, setStatus] = useState<"all" | RecordStatus>("all");
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const openRecord = records.find((r) => r.id === openId) ?? null;

  const PAGE_SIZE = 40;

  const submitters = Array.from(new Set(records.map((r) => r.created_by))).sort();

  const filtered = records.filter(
    (r) =>
      (objectId === "all" || r.object_id === objectId) &&
      (status === "all" || r.status === status) &&
      (submitter === "all" || r.created_by === submitter) &&
      r.items.some((i) => i.name.toLowerCase().includes(query.toLowerCase())),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const updateFilter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1); // при смене любого фильтра начинаем заново с первой страницы
    };

  const hasActiveFilters =
    objectId !== "all" || status !== "all" || query !== "" || submitter !== "all";

  const clearFilters = () => {
    setObjectId("all");
    setStatus("all");
    setQuery("");
    setSubmitter("all");
    setPage(1);
  };

  const goToPage = (next: number) => {
    setPage(Math.min(totalPages, Math.max(1, next)));
    const scrollContainer = document.getElementById("app-scroll-container");
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const Pagination = () => (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Показано {filtered.length === 0 ? 0 : pageStart + 1}–
        {Math.min(pageStart + PAGE_SIZE, filtered.length)} из {filtered.length} записей
      </span>
      <span className="flex items-center gap-2">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        Страница <span className="font-semibold text-foreground">{currentPage}</span> из{" "}
        {totalPages}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </span>
    </div>
  );

  return (
    <AppShell>
      <div className="bg-background pt-5 pb-3 md:sticky md:top-0 md:z-20 md:border-b md:border-border md:pt-6 md:shadow-[0_8px_12px_-10px_rgba(15,23,42,0.35)] xl:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Все записи</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Выполненные работы по всем объектам
            </p>
          </div>
          <Link
            to="/records/new"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Новая запись
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold md:hidden"
          >
            <SlidersHorizontal className="size-4" />
            {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
              Очистить
            </button>
          )}
        </div>

        <div
          className={cn(
            "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
            !filtersOpen && "hidden md:grid",
          )}
        >
          <label className="block">
            <span className="label-caps">Объект</span>
            <select
              value={objectId}
              onChange={(e) => updateFilter(setObjectId)(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">Все объекты</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-caps">Поиск по работе</span>
            <input
              value={query}
              onChange={(e) => updateFilter(setQuery)(e.target.value)}
              placeholder="Вид работы..."
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="label-caps">Кто подал</span>
            <select
              value={submitter}
              onChange={(e) => updateFilter(setSubmitter)(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">Все</option>
              {submitters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-caps">Дата</span>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="label-caps">Статус</span>
            <select
              value={status}
              onChange={(e) => updateFilter(setStatus)(e.target.value as "all" | RecordStatus)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">Все</option>
              {(Object.keys(statusLabels) as RecordStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <Pagination />
        </div>

        <div className="mt-3 hidden grid-cols-[2.5fr_1.2fr_1.2fr_1fr_1fr_1.2fr] gap-3 rounded-t-2xl border border-border bg-card px-4 py-3 lg:grid">
          <span className="label-caps">Объект / Вид работы</span>
          <span className="label-caps">Кто подал</span>
          <span className="label-caps">Сотрудник / Бригада</span>
          <span className="label-caps">Дата</span>
          <span className="label-caps">Статус</span>
          <span className="label-caps">Изменено</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border lg:rounded-t-none lg:border-t-0">
        {paginated.map((r) => {
          const object = objects.find((o) => o.id === r.object_id);
          const performer =
            r.execution_type === "brigade" ? (r.brigade_name ?? "") : r.employees.join(", ");
          return (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setOpenId(r.id)}
                className="grid h-auto w-full auto-rows-min grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-muted/40 lg:grid-cols-[2.5fr_1.2fr_1.2fr_1fr_1fr_1.2fr] lg:items-start lg:gap-3"
              >
                <span className="block">
                  <span className="block break-words whitespace-normal">
                    {object ? (
                      <>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {object.name}
                        </span>{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {object.address}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-normal text-muted-foreground">
                        Объект не выбран
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-col gap-1">
                    {r.items.length > 0 ? (
                      r.items.map((item, i) => (
                        <span
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                        >
                          <span className="text-base font-semibold break-words text-foreground">
                            {item.name}
                            {i < r.items.length - 1 ? ";" : ""}
                          </span>
                          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold tabular-nums text-primary">
                            {itemQty(item)} {item.unit}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-base font-semibold text-foreground">
                        Виды работ не добавлены
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm break-words">
                  <InitialsAvatar name={r.created_by} />
                  {r.created_by}
                </span>
                <span className="text-sm break-words">{performer}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                  <span>
                    {r.date.slice(0, 5)}, {r.time}
                  </span>
                  {r.photos.length > 0 && (
                    <span
                      className="flex items-center gap-0.5 font-semibold text-primary"
                      title={`${r.photos.length} фото`}
                    >
                      <ImageIcon className="size-4" />
                      {r.photos.length}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                </span>
                <span className="text-xs text-muted-foreground break-words">
                  {r.updated_by ? (
                    <>
                      <span className="font-semibold text-foreground">{r.updated_by}</span>
                      {r.updated_at ? <> · {r.updated_at}</> : null}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4">
          <Pagination />
        </div>
      )}

      {openRecord && <RecordDetail record={openRecord} onClose={() => setOpenId(null)} />}
    </AppShell>
  );
}
