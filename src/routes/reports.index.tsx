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

const periods = ["Эта неделя", "Месяц", "Все объекты"] as const;

function ReportsPage() {
  const { records, objects, role, employees } = useApp();
  const [period, setPeriod] = useState<(typeof periods)[number]>("Эта неделя");
  const [grouping, setGrouping] = useState<"employees" | "objects">("employees");

  const perObject = objects
    .map((o) => ({ ...o, count: records.filter((r) => r.object_id === o.id).length }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...perObject.map((p) => p.count));
  const volume = records.reduce((s, r) => s + r.items.reduce((a, i) => a + i.qty, 0), 0);

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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric value="128" label="записей за неделю" accent />
        <Metric value={String(objects.length)} label="активных объектов" />
        <Metric value={`${Math.round(volume)}`} label="суммарный объём (ед.)" />
        <Metric value={String(employees.length)} label="сотрудников вышло" />
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
            <h3 className="font-semibold">Отчёт по объекту / сотруднику</h3>
            <div className="mt-3 space-y-2">
              <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <option>Все объекты</option>
                {objects.map((o) => (
                  <option key={o.id}>{o.name}</option>
                ))}
              </select>
              <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <option>Все сотрудники</option>
                {employees.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
              <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <option>Все подавшие</option>
                <option>Иванов К.</option>
                <option>Смирнов М.</option>
              </select>
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