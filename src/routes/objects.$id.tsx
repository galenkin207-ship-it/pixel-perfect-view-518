import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { StatusBadge } from "@/components/app/status-badge";
import { statusBar } from "@/lib/status-styles";
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
  const { objects, records, role, archiveObject, restoreObject } = useApp();
  const object = objects.find((o) => o.id === id);
  const list = records.filter((r) => r.object_id === id);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRecord = records.find((r) => r.id === openId) ?? null;
  const [busy, setBusy] = useState(false);
  const canManage = role === "curator" || role === "admin";

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

  const isArchived = object.status === "archived";

  return (
    <AppShell {...(isArchived ? {} : { fab: { to: "/records/new", search: { object: id } } })}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading context={object.name} title={object.address} />
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (isArchived) {
                  await restoreObject(object.id);
                  toast.success("Объект возвращён в активную работу");
                } else {
                  await archiveObject(object.id);
                  toast.success("Объект перенесён в архив");
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Не удалось изменить статус");
              } finally {
                setBusy(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="size-3.5" />
                {busy ? "..." : "Вернуть из архива"}
              </>
            ) : (
              <>
                <Archive className="size-3.5" />
                {busy ? "..." : "Завершить объект"}
              </>
            )}
          </button>
        )}
      </div>

      {isArchived && (
        <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
          Объект в архиве — работы завершены, новые записи по нему не добавляются.
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((r) => {
          const crew = r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees;
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
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm break-words">{item.name}</span>
                      <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                        — {itemQty(item)} {item.unit}
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
