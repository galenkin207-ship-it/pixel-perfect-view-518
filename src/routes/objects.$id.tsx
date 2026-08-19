import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { StatusBadge, statusBar } from "@/components/app/status-badge";
import { allocationsFor, itemQty } from "@/lib/record-utils";
import { useApp } from "@/state/use-app";

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
  const [openId, setOpenId] = useState<string | null>(null);
  const openRecord = records.find((r) => r.id === openId) ?? null;

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
        {list.map((r) => {
          const crew =
            r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees;
          return (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5 text-left hover:bg-muted/30"
            >
              <span
                className={`absolute inset-y-3 left-0 w-1 rounded-full ${statusBar[r.status]}`}
              />
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 font-bold break-words whitespace-normal">
                  {r.items.map((i) => i.name).join(", ")}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 space-y-1.5 rounded-xl bg-surface p-3">
                {r.items.map((item, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 text-sm break-words">{item.name}</span>
                      <span className="font-mono text-sm font-bold">
                        {itemQty(item)} {item.unit}
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {(item.allocations?.length
                        ? item.allocations
                        : allocationsFor(item, crew)
                      ).map((a) => (
                        <div
                          key={a.employee}
                          className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground"
                        >
                          <span className="min-w-0 flex-1 break-words">{a.employee}</span>
                          <span className="font-mono">
                            {a.qty} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {r.execution_type === "brigade" ? r.brigade_name : crew.join(", ")} · {r.time}
              </p>
              {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
              {r.status === "draft" && (
                <span className="mt-2 inline-block text-sm font-semibold text-primary">
                  Продолжить заполнение →
                </span>
              )}
            </button>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">По этому объекту записей пока нет.</p>
        )}
      </div>

      {openRecord && <RecordDetail record={openRecord} onClose={() => setOpenId(null)} />}
    </AppShell>
  );
}