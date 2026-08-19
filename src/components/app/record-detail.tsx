import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";

import { FieldLabel } from "@/components/app/bits";
import { StatusBadge } from "@/components/app/status-badge";
import { allocationsFor, itemQty, recordTotal } from "@/lib/record-utils";
import type { WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

export function RecordDetail({ record, onClose }: { record: WorkRecord; onClose: () => void }) {
  const { objects, role } = useApp();
  const [photo, setPhoto] = useState<string | null>(null);
  const object = objects.find((o) => o.id === record.object_id);
  const isAdmin = role === "admin";
  const crew =
    record.execution_type === "brigade" ? (record.brigade_members ?? []) : record.employees;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-5 md:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {object?.name} · {object?.address}
            </p>
            <h2 className="mt-0.5 text-lg font-bold">
              Запись от {record.date}, {record.time}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Прораб: {record.created_by} ·{" "}
              {record.execution_type === "brigade" ? record.brigade_name : "По сотрудникам"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={record.status} />
            <button onClick={onClose} aria-label="Закрыть">
              <X className="size-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {record.items.map((item, idx) => {
            const allocations = item.allocations?.length
              ? item.allocations
              : allocationsFor(item, crew);
            return (
              <div key={idx} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 font-semibold break-words whitespace-normal">
                    {item.name}
                  </p>
                  <p className="shrink-0 font-mono text-sm font-bold">
                    {itemQty(item)} {item.unit}
                  </p>
                </div>
                <div className="mt-3 rounded-xl bg-card p-3">
                  <FieldLabel>Кто и сколько сделал</FieldLabel>
                  <div className="mt-2 space-y-1.5">
                    {allocations.map((a) => (
                      <div key={a.employee} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 text-sm break-words">{a.employee}</span>
                        <span className="font-mono text-sm font-semibold">
                          {a.qty} {item.unit}
                        </span>
                      </div>
                    ))}
                    {allocations.length === 0 && (
                      <p className="text-sm text-muted-foreground">Состав не указан</p>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.price.toLocaleString("ru-RU")} ₽ / {item.unit} ·{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {(itemQty(item) * item.price).toLocaleString("ru-RU")} ₽
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {record.comment && (
          <div className="mt-4">
            <FieldLabel>Комментарий прораба</FieldLabel>
            <p className="mt-1 text-sm break-words">{record.comment}</p>
          </div>
        )}

        <div className="mt-4">
          <FieldLabel>Фото записи</FieldLabel>
          {record.photos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {record.photos.map((p) => (
                <button
                  key={p}
                  onClick={() => setPhoto(p)}
                  className="flex size-20 items-center justify-center rounded-xl bg-muted p-2 text-center text-[10px] text-muted-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Фото не добавлены</p>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
            <span className="label-caps">Итого по записи</span>
            <span className="font-mono text-lg font-bold">
              {recordTotal(record.items).toLocaleString("ru-RU")} ₽
            </span>
          </div>
        )}

        <Link
          to="/records/$id"
          params={{ id: record.id }}
          className="mt-4 block rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
        >
          {record.status === "draft" ? "Продолжить заполнение" : "Редактировать запись"}
        </Link>

        {photo && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-6"
            onClick={() => setPhoto(null)}
          >
            <div className="flex aspect-[4/3] w-full max-w-xl items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">
              {photo} — полный размер
            </div>
          </div>
        )}
      </div>
    </div>
  );
}