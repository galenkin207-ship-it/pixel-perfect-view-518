import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImageIcon, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { SearchableSelect } from "@/components/app/searchable-select";
import { StatusBadge } from "@/components/app/status-badge";
import { ruToIso } from "@/lib/api-client";
import { itemQty } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import { statusLabels, type RecordStatus, type WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

// Фильтры и страница пагинации хранятся в URL (а не в локальном useState),
// чтобы не сбрасываться при переходе на другую страницу (например, при
// редактировании записи) и обратно — при возврате на /reports/all тот же URL
// восстанавливает ровно те же фильтры.
export type ReportsAllSearch = {
  object: string;
  status: string;
  query: string;
  submitter: string;
  performer: string;
  date: string;
  page: number;
};

export const Route = createFileRoute("/reports/all")({
  validateSearch: (search: Record<string, unknown>): ReportsAllSearch => ({
    object: typeof search["object"] === "string" ? search["object"] : "all",
    status: typeof search["status"] === "string" ? search["status"] : "all",
    query: typeof search["query"] === "string" ? search["query"] : "",
    submitter: typeof search["submitter"] === "string" ? search["submitter"] : "all",
    performer: typeof search["performer"] === "string" ? search["performer"] : "all",
    date: typeof search["date"] === "string" ? search["date"] : "",
    page: Number(search["page"]) > 0 ? Number(search["page"]) : 1,
  }),
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
  const { records, objects, employees, submitterNames } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { object: objectId, status, query, submitter, performer, date, page } = search;
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openRecord = records.find((r) => r.id === openId) ?? null;

  const PAGE_SIZE = 40;

  // Список "Кто подал" — реальные авторы записей + вручную добавленные
  // пользователи (is_submitter), даже если у них ещё нет ни одной записи.
  const submitters = Array.from(
    new Set([...records.map((r) => r.created_by), ...submitterNames]),
  ).sort();

  // Список для фильтра "Сотрудник/Бригада" — сотрудники из общего справочника
  // + названия бригад, реально встречающиеся в записях (личный список бригад
  // текущего пользователя из useApp тут не подходит: "Все записи" смотрят
  // куратор/админ, а бригады у каждого прораба свои).
  const performers = Array.from(
    new Set([
      ...employees,
      ...records
        .filter((r) => r.execution_type === "brigade" && r.brigade_name)
        .map((r) => r.brigade_name as string),
    ]),
  ).sort();

  // Совпадение по сотруднику/бригаде: выбранное имя может быть либо
  // сотрудником, выполнявшим запись самостоятельно, либо названием бригады,
  // либо участником бригады — так по ФИО сотрудника находятся и его личные
  // записи, и записи бригад, в которых он участвовал.
  const matchesPerformer = (r: WorkRecord, value: string) =>
    r.employees.includes(value) ||
    r.brigade_name === value ||
    (r.brigade_members ?? []).includes(value);

  const filtered = records.filter(
    (r) =>
      (objectId === "all" || r.object_id === objectId) &&
      (status === "all" || r.status === status) &&
      (submitter === "all" || r.created_by === submitter) &&
      (performer === "all" || matchesPerformer(r, performer)) &&
      (date === "" || ruToIso(r.date) === date) &&
      r.items.some((i) => i.name.toLowerCase().includes(query.toLowerCase())),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // Записываем изменения фильтров прямо в URL (replace — чтобы не засорять
  // историю переходов отдельной записью на каждое нажатие клавиши/фильтр).
  // Собираем объект явно из уже типизированного search, а не через
  // функциональный updater — иначе TanStack выводит тип prev как объединение
  // search-параметров ВСЕХ роутов приложения и типы перестают сходиться.
  const updateFilter = (patch: Partial<ReportsAllSearch>) => {
    void navigate({
      to: "/reports/all",
      search: { ...search, ...patch, page: 1 },
      replace: true,
    });
  };

  const hasActiveFilters =
    objectId !== "all" ||
    status !== "all" ||
    query !== "" ||
    submitter !== "all" ||
    performer !== "all" ||
    date !== "";

  const clearFilters = () => {
    void navigate({
      to: "/reports/all",
      search: {
        object: "all",
        status: "all",
        query: "",
        submitter: "all",
        performer: "all",
        date: "",
        page: 1,
      },
      replace: true,
    });
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(totalPages, Math.max(1, next));
    void navigate({
      to: "/reports/all",
      search: { ...search, page: clamped },
      replace: true,
    });
  };

  const Pagination = ({ withClear = false }: { withClear?: boolean } = {}) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        Показано {filtered.length === 0 ? 0 : pageStart + 1}–
        {Math.min(pageStart + PAGE_SIZE, filtered.length)} из {filtered.length} записей
      </span>
      {withClear && hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
          Очистить
        </button>
      )}
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

        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold md:hidden"
        >
          <SlidersHorizontal className="size-4" />
          {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
        </button>

        <div
          className={cn(
            "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6",
            !filtersOpen && "hidden md:grid",
          )}
        >
          <label className="block">
            <span className="label-caps">Объект</span>
            <div className="mt-1">
              <SearchableSelect
                items={objects.map((o) => ({ id: o.id, label: o.name }))}
                value={objectId === "all" ? "" : objectId}
                onChange={(id) => updateFilter({ object: id === "" ? "all" : id })}
                allLabel="Все объекты"
                searchPlaceholder="Поиск объекта..."
              />
            </div>
          </label>
          <label className="block">
            <span className="label-caps">Поиск по работе</span>
            <input
              value={query}
              onChange={(e) => updateFilter({ query: e.target.value })}
              placeholder="Вид работы..."
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="label-caps">Сотрудник / Бригада</span>
            <div className="mt-1">
              <SearchableSelect
                items={performers.map((p) => ({ id: p, label: p }))}
                value={performer === "all" ? "" : performer}
                onChange={(id) => updateFilter({ performer: id === "" ? "all" : id })}
                allLabel="Все"
                searchPlaceholder="Поиск сотрудника или бригады..."
              />
            </div>
          </label>
          <label className="block">
            <span className="label-caps">Кто подал</span>
            <div className="mt-1">
              <SearchableSelect
                items={submitters.map((s) => ({ id: s, label: s }))}
                value={submitter === "all" ? "" : submitter}
                onChange={(id) => updateFilter({ submitter: id === "" ? "all" : id })}
                allLabel="Все"
                searchPlaceholder="Поиск по ФИО..."
              />
            </div>
          </label>
          <label className="block">
            <span className="label-caps">Дата</span>
            <input
              type="date"
              value={date}
              onChange={(e) => updateFilter({ date: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="label-caps">Статус</span>
            <select
              value={status}
              onChange={(e) => updateFilter({ status: e.target.value })}
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
          <Pagination withClear />
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

      {openRecord && (
        <RecordDetail
          record={openRecord}
          onClose={() => setOpenId(null)}
          editReturnTo="reports-all"
          editReturnSearch={JSON.stringify(search)}
        />
      )}
    </AppShell>
  );
}
