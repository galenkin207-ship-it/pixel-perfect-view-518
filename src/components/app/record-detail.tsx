import { Link } from "@tanstack/react-router";
import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldLabel } from "@/components/app/bits";
import { StatusBadge } from "@/components/app/status-badge";
import { allocationsFor, canEditRecord, itemQty, recordTotal } from "@/lib/record-utils";
import { clearQuickDraftId } from "@/lib/quick-draft";
import type { WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

export function RecordDetail({ record, onClose }: { record: WorkRecord; onClose: () => void }) {
  const { objects, role, currentUser, deleteRecord } = useApp();
  const [photo, setPhoto] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const object = objects.find((o) => o.id === record.object_id);
  const isAdmin = role === "admin";
  const canEdit = canEditRecord(role, currentUser.full_name, record);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteRecord(record.id);
      clearQuickDraftId(record.id);
      toast.success("Запись удалена");
      onClose();
    } catch {
      toast.error("Не удалось удалить запись");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };
  const crew =
    record.execution_type === "brigade" ? (record.brigade_members ?? []) : record.employees;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 md:items-center md:justify-center md:p-6">
      <div className="h-full w-full overflow-y-auto bg-card p-5 md:max-h-[90vh] md:max-w-3xl md:rounded-3xl lg:max-w-4xl xl:max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {object?.name} · {object?.address}
            </p>
            <h2 className="mt-0.5 text-lg font-bold">
              Запись от {record.date}, {record.time}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Кто подал: {record.created_by} ·{" "}
              {record.execution_type === "brigade" ? record.brigade_name : "По сотрудникам"}
            </p>
            {record.updated_by && (
              <p className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs text-muted-foreground">
                <Pencil className="size-3" />
                Изменил: <span className="font-semibold text-foreground">{record.updated_by}</span>
                {record.updated_at && <>· {record.updated_at}</>}
              </p>
            )}
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
                  className="size-20 overflow-hidden rounded-xl bg-muted"
                >
                  <img src={p} alt="Фото к записи" className="size-full object-cover" />
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

        {canEdit ? (
          <>
            <Link
              to="/records/$id"
              params={{ id: record.id }}
              className="mt-4 block rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
            >
              {record.status === "draft" ? "Продолжить заполнение" : "Редактировать запись"}
            </Link>

            {confirmingDelete ? (
              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-foreground">
                  Удалить эту запись без возможности восстановления?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                  >
                    {deleting ? "Удаление..." : "Да, удалить"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="flex-1 rounded-lg bg-surface py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-destructive"
              >
                <Trash2 className="size-4" />
                Удалить запись
              </button>
            )}
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-surface py-3 text-center text-sm text-muted-foreground">
            Редактировать эту запись может только её автор, куратор или администратор
          </p>
        )}

        {photo && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-6"
            onClick={() => setPhoto(null)}
          >
            <img
              src={photo}
              alt="Фото к записи, полный размер"
              className="max-h-full max-w-xl rounded-2xl object-contain"
            />
          </div>
        )}
      </div>
    </div>
  );
}
