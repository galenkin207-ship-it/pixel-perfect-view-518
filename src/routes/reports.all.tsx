import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar } from "@/components/app/bits";
import { StatusBadge } from "@/components/app/status-badge";
import { statusLabels, type RecordStatus } from "@/data/mock";
import { useApp } from "@/state/app-context";

export const Route = createFileRoute("/reports/all")({
  head: () => ({
    meta: [
      { title: "Все записи — Учёт работ" },
      {
        name: "description",
        content:
          "Таблица всех выполненных работ по объектам с фильтрами по прорабу, дате и статусу.",
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
  const [expanded, setExpanded] = useState<string | null>("r2");

  const filtered = records.filter(
    (r) =>
      (objectId === "all" || r.object_id === objectId) &&
      (status === "all" || r.status === status) &&
      r.items.some((i) => i.name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <AppShell fab={{ to: "/records/new" }}>
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
          + Новая запись
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <span className="label-caps">Поиск</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по виду работы..."
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
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
        <div className="hidden grid-cols-[2.5fr_1.2fr_1.2fr_0.8fr_1fr_1fr] gap-3 border-b border-border bg-card px-4 py-3 lg:grid">
          <span className="label-caps">Вид работы / Объект</span>
          <span className="label-caps">Прораб</span>
          <span className="label-caps">Сотрудник / Бригада</span>
          <span className="label-caps">Объём</span>
          <span className="label-caps">Дата</span>
          <span className="label-caps">Статус</span>
        </div>
        {filtered.map((r) => {
          const object = objects.find((o) => o.id === r.object_id);
          const performer =
            r.execution_type === "brigade" ? (r.brigade_name ?? "") : r.employees.join(", ");
          const open = expanded === r.id;
          return (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setExpanded(open ? null : r.id)}
                className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-muted/40 lg:grid-cols-[2.5fr_1.2fr_1.2fr_0.8fr_1fr_1fr] lg:items-center lg:gap-3"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {r.items.map((i) => i.name).join(", ")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {object?.name} · {object?.address}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <InitialsAvatar name={r.created_by} />
                  {r.created_by}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <InitialsAvatar name={performer} />
                  {performer}
                </span>
                <span className="font-mono text-sm">
                  {r.items[0]!.qty} {r.items[0]!.unit}
                </span>
                <span className="text-sm text-muted-foreground">
                  {r.date.slice(0, 5)}, {r.time}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {open && (
                <div className="grid gap-4 bg-surface px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                  <Cell label="Начало" value={r.started_at ?? "—"} />
                  <Cell label="Окончание" value={r.finished_at ?? "—"} />
                  <Cell label="Материал" value={r.material ?? "—"} />
                  <Cell label="Комментарий прораба" value={r.comment || "—"} />
                  <Cell label="Сумма" value={`${r.total.toLocaleString("ru-RU")} ₽`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <span className="label-caps">{label}</span>
      <span className="mt-0.5 block font-semibold">{value}</span>
    </span>
  );
}