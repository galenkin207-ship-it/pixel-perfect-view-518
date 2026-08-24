import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading, FieldLabel } from "@/components/app/bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { api, type AuditLogEntry, type AuditLogEntryFull } from "@/lib/api-client";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "История изменений — Учёт работ" },
      {
        name: "description",
        content: "Аудит-лог изменений записей и заявок с возможностью восстановления.",
      },
    ],
  }),
  component: AuditLogPage,
});

const PER_PAGE = 30;

const entityLabels: Record<AuditLogEntry["entity_type"], string> = {
  record: "Запись",
  request: "Заявка",
};

const actionLabels: Record<AuditLogEntry["action"], string> = {
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
  restore: "Восстановление",
};

const actionStyles: Record<AuditLogEntry["action"], string> = {
  create: "bg-status-done-soft text-status-done",
  update: "bg-status-progress-soft text-status-progress",
  delete: "bg-status-rejected-soft text-status-rejected",
  restore: "bg-status-review-soft text-status-review",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat("ru-RU").format(d)}, ${new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)}`;
}

function recordLabel(data: Record<string, unknown> | null) {
  if (!data) return null;
  const name = typeof data["object_name_raw"] === "string" ? data["object_name_raw"] : "";
  const date = typeof data["date"] === "string" ? data["date"] : "";
  const totalRaw = data["total"];
  const total = typeof totalRaw === "number" || typeof totalRaw === "string" ? totalRaw : "";
  return [name, date, total ? `${total} ₽` : ""].filter(Boolean).join(" · ");
}

function requestLabel(data: Record<string, unknown> | null) {
  if (!data) return null;
  const text = typeof data["text"] === "string" ? (data["text"] as string) : "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function EntrySummary({ entry }: { entry: AuditLogEntryFull }) {
  const data = (entry.after_data ?? entry.before_data) as Record<string, unknown> | null;
  const label = entry.entity_type === "record" ? recordLabel(data) : requestLabel(data);
  if (!label) return null;
  return <p className="mt-2 truncate text-sm text-muted-foreground">{label}</p>;
}

function AuditLogPage() {
  const { role } = useApp();
  const canView = role === "admin" || role === "curator";
  const isAdmin = role === "admin";

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [entityType, setEntityType] = useState<"" | "record" | "request">("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [details, setDetails] = useState<Record<number, AuditLogEntryFull>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AuditLogEntry | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = async (nextPage: number) => {
    setLoading(true);
    try {
      const result = await api.listAuditLog({
        ...(entityType ? { entity_type: entityType } : {}),
        ...(actor ? { actor } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit: PER_PAGE,
        offset: nextPage * PER_PAGE,
      });
      setEntries(result.entries);
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      toast.error("Не удалось загрузить историю изменений");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, actor, from, to, canView]);

  const toggleExpand = async (entry: AuditLogEntry) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (!details[entry.id]) {
      try {
        const full = await api.getAuditLogEntry(String(entry.id));
        setDetails((prev) => ({ ...prev, [entry.id]: full }));
      } catch {
        toast.error("Не удалось загрузить детали записи истории");
      }
    }
  };

  const runRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await api.restoreAuditLogEntry(String(restoreTarget.id));
      toast.success("Восстановлено");
      setRestoreTarget(null);
      await load(page);
    } catch {
      toast.error("Не удалось восстановить — попробуйте ещё раз");
    } finally {
      setRestoring(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const restorable = useMemo(
    () => (e: AuditLogEntry) => (e.action === "update" || e.action === "delete") && e.has_before,
    [],
  );

  if (!canView) {
    return <Navigate to="/" />;
  }

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="История изменений" />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <FieldLabel>Тип</FieldLabel>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as typeof entityType)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Всё</option>
            <option value="record">Записи</option>
            <option value="request">Заявки</option>
          </select>
        </div>
        <div>
          <FieldLabel>Кто изменил</FieldLabel>
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="ФИО"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <FieldLabel>С даты</FieldLabel>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <FieldLabel>По дату</FieldLabel>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Загрузка…</p>
        )}
        {!loading && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <History className="mx-auto mb-2 size-6 text-muted-foreground" />
            Ничего не найдено за выбранный период.
          </p>
        )}
        {entries.map((entry) => {
          const expanded = expandedId === entry.id;
          const full = details[entry.id];
          return (
            <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
              <button
                type="button"
                onClick={() => void toggleExpand(entry)}
                className="flex w-full flex-wrap items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase",
                    actionStyles[entry.action],
                  )}
                >
                  {actionLabels[entry.action]}
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {entityLabels[entry.entity_type]} #{entry.entity_id}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {entry.actor_name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                </span>
                {entry.restored_at && (
                  <span className="shrink-0 rounded-full bg-status-review-soft px-2 py-0.5 text-[10px] font-semibold text-status-review">
                    Восстановлено
                  </span>
                )}
              </button>

              {expanded && (
                <div className="mt-3 border-t border-border pt-3">
                  {!full ? (
                    <p className="text-sm text-muted-foreground">Загрузка…</p>
                  ) : (
                    <>
                      <EntrySummary entry={full} />
                      {entry.restored_at && entry.restored_by_name && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Восстановлено пользователем {entry.restored_by_name},{" "}
                          {formatDateTime(entry.restored_at)}
                        </p>
                      )}
                      {isAdmin && restorable(entry) && (
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(entry)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                        >
                          <RotateCcw className="size-3.5" />
                          Восстановить это состояние
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => void load(page - 1)}
            className="rounded-lg bg-surface px-3 py-2 font-semibold disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-muted-foreground">
            Стр. {page + 1} из {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages - 1 || loading}
            onClick={() => void load(page + 1)}
            className="rounded-lg bg-surface px-3 py-2 font-semibold disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить это состояние?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget?.entity_type === "record"
                ? "Запись будет возвращена к состоянию на момент этого изменения (включая фото, если они были)."
                : "Заявка будет возвращена к состоянию на момент этого изменения."}{" "}
              Текущие данные будут перезаписаны. Это действие само попадёт в историю, так что при
              необходимости его тоже можно будет отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={restoring} onClick={() => void runRestore()}>
              {restoring ? "Восстанавливаем…" : "Восстановить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
