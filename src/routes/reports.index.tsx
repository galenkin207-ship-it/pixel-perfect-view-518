import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Отчёты и дашборд — Учёт работ" },
      {
        name: "description",
        content:
          "Сводка по выполненным работам: метрики за период, разбивка по объектам и подробные отчёты.",
      },
      { property: "og:title", content: "Отчёты и дашборд — Учёт работ" },
      {
        property: "og:description",
        content: "Метрики за неделю и месяц, свод по объектам, выгрузка в Excel.",
      },
    ],
  }),
  component: ReportsPage,
});

const periods = ["Эта неделя", "Месяц"] as const;

function parseDate(d: string) {
  const [dd, mm, yyyy] = d.split(".").map(Number);
  return new Date(yyyy ?? 1970, (mm ?? 1) - 1, dd ?? 1);
}

function ReportsPage() {
  const { records, objects, role, employees } = useApp();
  const [period, setPeriod] = useState<(typeof periods)[number]>("Эта неделя");
  const [grouping, setGrouping] = useState<"employees" | "objects">("employees");
  const [rObject, setRObject] = useState("");
  const [rEmployee, setREmployee] = useState("");
  const [rSubmitter, setRSubmitter] = useState("");
  const [rFrom, setRFrom] = useState("");
  const [rTo, setRTo] = useState("");

  const submitters = Array.from(new Set(records.map((r) => r.created_by))).sort();

  const now = new Date();
  const periodRecords = records.filter((r) => {
    const d = parseDate(r.date);
    if (period === "Месяц") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    const start = new Date(now);
    const dow = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  });

  const perObject = objects
    .map((o) => ({ ...o, count: periodRecords.filter((r) => r.object_id === o.id).length }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...perObject.map((p) => p.count));
  const volume = periodRecords.reduce((s, r) => s + r.items.reduce((a, i) => a + i.qty, 0), 0);
  const activeEmployees = new Set(
    periodRecords.flatMap((r) =>
      r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees,
    ),
  ).size;

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Отчёты" />

      <div className="mt-4 flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "bg-surface text-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:gap-4">
        <Metric
          value={String(periodRecords.length)}
          label={period === "Месяц" ? "записей за месяц" : "записей за неделю"}
          accent
        />
        <Metric value={String(perObject.filter((o) => o.count > 0).length)} label="активных объектов" />
        <Metric value={`${Math.round(volume)}`} label="суммарный объём (ед.)" />
        <Metric value={String(activeEmployees)} label="сотрудников вышло" />
      </div>

      <section className="mt-6">
        <h2 className="label-caps">По объектам</h2>
        <div className="mt-3 space-y-3">
          {perObject.map((o) => (
            <div key={o.id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm">{o.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(o.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right font-mono text-sm font-bold">{o.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Подробные отчёты</h2>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Статистика за период</h3>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
              {(["employees", "objects"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGrouping(g)}
                  className={cn(
                    "rounded-lg py-2 text-xs font-semibold",
                    grouping === g ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {g === "employees" ? "По сотрудникам" : "По объектам"}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input type="date" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input type="date" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Отчёт по объекту / сотруднику / подавшему</h3>
            <div className="mt-3 space-y-2">
              <select
                value={rObject}
                onChange={(e) => setRObject(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все объекты</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <select
                value={rEmployee}
                onChange={(e) => setREmployee(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все сотрудники</option>
                {employees.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <select
                value={rSubmitter}
                onChange={(e) => setRSubmitter(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все подавшие</option>
                {submitters.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>С даты</FieldLabel>
                  <input
                    type="date"
                    value={rFrom}
                    onChange={(e) => setRFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>По дату</FieldLabel>
                  <input
                    type="date"
                    value={rTo}
                    onChange={(e) => setRTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Link
                to="/reports/detail"
                search={{
                  object: rObject,
                  employee: rEmployee,
                  submitter: rSubmitter,
                  from: rFrom,
                  to: rTo,
                }}
                className="block rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
              >
                Открыть подробный отчёт
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Месячный свод по всем объектам</h3>
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Месяц</FieldLabel>
                  <select className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                    <option>Август</option>
                    <option>Июль</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Год</FieldLabel>
                  <select className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                    <option>2026</option>
                    <option>2025</option>
                  </select>
                </div>
              </div>
              <button className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                Скачать Excel
              </button>
            </div>
          </div>
        </div>

        <Link
          to="/reports/all"
          className="mt-4 inline-block text-sm font-semibold text-primary"
        >
          Все записи — таблица с фильтрами →
        </Link>
      </section>
    </AppShell>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className={cn("font-mono text-3xl font-bold", accent && "text-primary")}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}