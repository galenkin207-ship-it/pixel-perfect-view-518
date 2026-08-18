import { createFileRoute, Link, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { StatusBadge, statusBar } from "@/components/app/status-badge";
import { useApp } from "@/state/app-context";

export const Route = createFileRoute("/objects/$id")({
  head: () => ({
    meta: [
      { title: "Записи по объекту — Учёт работ" },
      {
        name: "description",
        content: "Выполненные работы по объекту: вид работы, объём, исполнитель и статус.",
      },
      { property: "og:title", content: "Записи по объекту — Учёт работ" },
      {
        property: "og:description",
        content: "Хронология выполненных работ на строительном объекте.",
      },
    ],
  }),
  component: ObjectRecordsPage,
});

function ObjectRecordsPage() {
  const { id } = useParams({ from: "/objects/$id" });
  const { objects, records } = useApp();
  const object = objects.find((o) => o.id === id);
  const list = records.filter((r) => r.object_id === id);

  if (!object) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Объект не найден.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
          К списку объектов
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell fab={{ to: "/records/new" }}>
      <PageHeading context={object.name} title={object.address} />

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <div
            key={r.id}
            className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5"
          >
            <span className={`absolute inset-y-3 left-0 w-1 rounded-full ${statusBar[r.status]}`} />
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold">{r.items.map((i) => i.name).join(", ")}</p>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-mono text-lg font-bold">
                {r.items[0]!.qty} <span className="text-sm font-normal">{r.items[0]!.unit}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {r.execution_type === "brigade" ? r.brigade_name : r.employees.join(", ")} ·{" "}
                {r.time}
              </p>
            </div>
            {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">По этому объекту записей пока нет.</p>
        )}
      </div>
    </AppShell>
  );
}