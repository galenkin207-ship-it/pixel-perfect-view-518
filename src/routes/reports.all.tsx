import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { StatusBadge } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";
import { itemQty } from "@/lib/record-utils";
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
  const openRecord = records.find((r) => r.id === openId) ?? null;

  const submitters = Array.from(new Set(records.map((r) => r.created_by))).sort();

  const filtered = records.filter(
    (r) =>
      (objectId === "all" || r.object_id === objectId) &&
      (status === "all" || r.status === status) &&
      (submitter === "all" || r.created_by === submitter) &&
      r.items.some((i) => i.name.toLowerCase().includes(query.toLowerCase())),
  );


  return (
    <AppShell>
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
          "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
          !filtersOpen && "hidden md:grid",
        )}
      >
        <label className="block">
          <span className="label-caps">Объект</span>
          <select
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Вид работы..."
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Кто подал</span>
          <select
            value={submitter}
            onChange={(e) => setSubmitter(e.target.value)}
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
            onChange={(e) => setStatus(e.target.value as "all" | RecordStatus)}
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


      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Показано 1–{filtered.length} из {records.length} записей
        </span>
        <span className="flex items-center gap-2">
          <button className="rounded-lg border border-border px-2 py-1">←</button>
          Страница <span className="font-semibold text-foreground">1</span> из 1
          <button className="rounded-lg border border-border px-2 py-1">→</button>
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border">
        <div className="hidden grid-cols-[2.5fr_1.2fr_1.2fr_1fr_1fr_1.2fr] gap-3 border-b border-border bg-card px-4 py-3 lg:grid">
          <span className="label-caps">Объект / Вид работы</span>
          <span className="label-caps">Кто подал</span>
          <span className="label-caps">Сотрудник / Бригада</span>
          <span className="label-caps">Дата</span>
          <span className="label-caps">Статус</span>
          <span className="label-caps">Изменено</span>
        </div>
        {filtered.map((r) => {
          const object = objects.find((o) => o.id === r.object_id);
          const performer =
            r.execution_type === "brigade" ? (r.brigade_name ?? "") : r.employees.join(", ");
          return (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setOpenId(r.id)}
                className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-muted/40 lg:grid-cols-[2.5fr_1.2fr_1.2fr_0.8fr_1fr_1fr_1.2fr] lg:items-start lg:gap-3"
              >
                <span className="block">
                  <span className="block text-sm font-semibold break-words whitespace-normal">
                    {object?.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {object?.address}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm font-medium text-foreground">
                    {r.items.map((i) => i.name).join(", ")}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm break-words">
                  <InitialsAvatar name={r.created_by} />
                  {r.created_by}
                </span>
                <span className="flex items-center gap-2 text-sm break-words">
                  <InitialsAvatar name={performer} />
                  {performer}
                </span>
                <span className="font-mono text-sm">
                  {itemQty(r.items[0]!)} {r.items[0]!.unit}
                </span>
                <span className="text-sm text-muted-foreground">
                  {r.date.slice(0, 5)}, {r.time}
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

      {openRecord && <RecordDetail record={openRecord} onClose={() => setOpenId(null)} />}
    </AppShell>
  );
}