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

// ---- Форматирование значений полей ----

function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (Number.isNaN(n)) return "";
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

function formatQty(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "";
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function formatDateField(v: unknown) {
  if (typeof v !== "string") return "";
  const d = v.slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

function get(obj: Record<string, unknown> | null | undefined, key: string): unknown {
  return obj ? obj[key] : undefined;
}

// ---- Дифф скалярных полей (по конфигу — что за поле, как его подписать/форматировать) ----

type FieldConfig = { key: string; label: string; format?: (v: unknown) => string };

const recordStatusLabels: Record<string, string> = { draft: "Черновик", done: "Готово" };

const recordScalarFields: FieldConfig[] = [
  { key: "object_name_raw", label: "Объект" },
  { key: "date", label: "Дата", format: formatDateField },
  {
    key: "employees",
    label: "Сотрудники",
    format: (v) => (Array.isArray(v) ? (v as string[]).join(", ") : ""),
  },
  { key: "total", label: "Сумма", format: formatMoney },
  { key: "comment", label: "Комментарий" },
  {
    key: "status",
    label: "Статус",
    format: (v) => recordStatusLabels[String(v)] ?? String(v ?? ""),
  },
];

const requestStatusLabels: Record<string, string> = {
  pending: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
  deleted: "Удалена",
};

const requestScalarFields: FieldConfig[] = [
  { key: "text", label: "Текст заявки" },
  {
    key: "status",
    label: "Статус",
    format: (v) => requestStatusLabels[String(v)] ?? String(v ?? ""),
  },
  { key: "resolved_name", label: "Утверждённое название" },
  { key: "resolved_unit", label: "Ед. изм." },
  { key: "resolved_price", label: "Цена", format: formatMoney },
  { key: "reject_reason", label: "Причина отклонения" },
];

type FieldValue = { key: string; label: string; value: string };

function readFields(data: Record<string, unknown> | null, fields: FieldConfig[]): FieldValue[] {
  if (!data) return [];
  return fields
    .map((f) => {
      const raw = get(data, f.key);
      const value = f.format ? f.format(raw) : raw != null ? String(raw) : "";
      return { key: f.key, label: f.label, value };
    })
    .filter((f) => f.value);
}

type ScalarDiff = { key: string; label: string; before: string; after: string };

function diffScalars(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: FieldConfig[],
): ScalarDiff[] {
  const result: ScalarDiff[] = [];
  for (const f of fields) {
    const bRaw = get(before, f.key);
    const aRaw = get(after, f.key);
    const bStr = f.format ? f.format(bRaw) : bRaw != null ? String(bRaw) : "";
    const aStr = f.format ? f.format(aRaw) : aRaw != null ? String(aRaw) : "";
    if (bStr !== aStr) result.push({ key: f.key, label: f.label, before: bStr, after: aStr });
  }
  return result;
}

function ScalarField({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "added" | "removed";
}) {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      <span
        className={cn(
          "font-medium",
          tone === "added" ? "text-status-done" : "text-status-rejected line-through",
        )}
      >
        {value}
      </span>
    </p>
  );
}

function ScalarDiffRow({ diff }: { diff: ScalarDiff }) {
  return (
    <p>
      <span className="text-muted-foreground">{diff.label}: </span>
      {diff.before && <span className="text-status-rejected line-through">{diff.before}</span>}
      {diff.before && diff.after && <span className="text-muted-foreground"> → </span>}
      {diff.after && <span className="font-medium text-status-done">{diff.after}</span>}
      {!diff.before && !diff.after && <span className="text-muted-foreground">—</span>}
    </p>
  );
}

// ---- Дифф видов работ в записи (сопоставляем по названию + ед. изм.) ----

type RecordItem = { name: string; unit: string; qty: number | string; price: number | string };

type ItemDiff = {
  key: string;
  name: string;
  unit: string;
  kind: "added" | "removed" | "changed";
  beforeQty?: number;
  afterQty?: number;
  beforePrice?: number;
  afterPrice?: number;
};

function itemsOf(data: Record<string, unknown> | null): RecordItem[] {
  const raw = get(data, "items");
  return Array.isArray(raw) ? (raw as RecordItem[]) : [];
}

function diffItems(beforeItems: RecordItem[], afterItems: RecordItem[]): ItemDiff[] {
  const key = (it: RecordItem) => `${it.name}||${it.unit}`;
  const beforeMap = new Map(beforeItems.map((it) => [key(it), it]));
  const afterMap = new Map(afterItems.map((it) => [key(it), it]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const result: ItemDiff[] = [];
  for (const k of keys) {
    const b = beforeMap.get(k);
    const a = afterMap.get(k);
    if (b && !a) {
      result.push({
        key: k,
        name: b.name,
        unit: b.unit,
        kind: "removed",
        beforeQty: Number(b.qty),
        beforePrice: Number(b.price),
      });
    } else if (!b && a) {
      result.push({
        key: k,
        name: a.name,
        unit: a.unit,
        kind: "added",
        afterQty: Number(a.qty),
        afterPrice: Number(a.price),
      });
    } else if (b && a && (Number(b.qty) !== Number(a.qty) || Number(b.price) !== Number(a.price))) {
      result.push({
        key: k,
        name: a.name,
        unit: a.unit,
        kind: "changed",
        beforeQty: Number(b.qty),
        afterQty: Number(a.qty),
        beforePrice: Number(b.price),
        afterPrice: Number(a.price),
      });
    }
  }
  return result;
}

function ItemsList({ items, tone }: { items: RecordItem[]; tone: "added" | "removed" }) {
  if (!items.length) return null;
  const cls = tone === "added" ? "text-status-done" : "text-status-rejected line-through";
  return (
    <div>
      <p className="text-muted-foreground">Виды работ:</p>
      <ul className="ml-3 list-disc space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className={cn("text-xs", cls)}>
            {it.name} — {formatQty(Number(it.qty))} {it.unit} × {formatMoney(it.price)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemDiffList({ diffs }: { diffs: ItemDiff[] }) {
  if (!diffs.length) return null;
  return (
    <div>
      <p className="text-muted-foreground">Виды работ:</p>
      <ul className="ml-3 list-disc space-y-0.5">
        {diffs.map((d) => (
          <li key={d.key} className="text-xs">
            {d.kind === "added" && (
              <span className="text-status-done">
                + {d.name} — {formatQty(d.afterQty)} {d.unit} × {formatMoney(d.afterPrice)}
              </span>
            )}
            {d.kind === "removed" && (
              <span className="text-status-rejected line-through">
                {d.name} — {formatQty(d.beforeQty)} {d.unit} × {formatMoney(d.beforePrice)}
              </span>
            )}
            {d.kind === "changed" && (
              <span>
                <span className="text-foreground">{d.name}</span>{" "}
                <span className="text-status-rejected line-through">
                  {formatQty(d.beforeQty)} {d.unit} × {formatMoney(d.beforePrice)}
                </span>{" "}
                <span className="text-muted-foreground">→</span>{" "}
                <span className="font-medium text-status-done">
                  {formatQty(d.afterQty)} {d.unit} × {formatMoney(d.afterPrice)}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Сборка вида для записи и заявки в зависимости от типа действия ----

function RecordChangeDetails({ entry }: { entry: AuditLogEntryFull }) {
  const before = entry.before_data;
  const after = entry.after_data;

  if (entry.action === "create" || entry.action === "restore") {
    const fields = readFields(
      after,
      recordScalarFields.filter((f) => f.key !== "employees"),
    );
    const employeesField = readFields(
      after,
      recordScalarFields.filter((f) => f.key === "employees"),
    )[0];
    const photos = get(after, "photos");
    return (
      <div className="mt-2 space-y-1.5 text-sm">
        {fields.map((f) => (
          <ScalarField key={f.key} label={f.label} value={f.value} tone="added" />
        ))}
        {employeesField && (
          <ScalarField label={employeesField.label} value={employeesField.value} tone="added" />
        )}
        <ItemsList items={itemsOf(after)} tone="added" />
        {Array.isArray(photos) && photos.length > 0 && (
          <p className="text-xs text-muted-foreground">Фото: {photos.length} шт.</p>
        )}
      </div>
    );
  }

  if (entry.action === "delete") {
    const fields = readFields(
      before,
      recordScalarFields.filter((f) => f.key !== "employees"),
    );
    const employeesField = readFields(
      before,
      recordScalarFields.filter((f) => f.key === "employees"),
    )[0];
    const photos = get(before, "photos");
    return (
      <div className="mt-2 space-y-1.5 text-sm">
        {fields.map((f) => (
          <ScalarField key={f.key} label={f.label} value={f.value} tone="removed" />
        ))}
        {employeesField && (
          <ScalarField label={employeesField.label} value={employeesField.value} tone="removed" />
        )}
        <ItemsList items={itemsOf(before)} tone="removed" />
        {Array.isArray(photos) && photos.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Фото: {photos.length} шт. (перемещены в корзину)
          </p>
        )}
      </div>
    );
  }

  // update
  const scalarDiffs = diffScalars(before, after, recordScalarFields);
  const itemDiffs = diffItems(itemsOf(before), itemsOf(after));

  if (scalarDiffs.length === 0 && itemDiffs.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">Изменений в данных не найдено.</p>;
  }

  return (
    <div className="mt-2 space-y-1.5 text-sm">
      {scalarDiffs.map((d) => (
        <ScalarDiffRow key={d.key} diff={d} />
      ))}
      <ItemDiffList diffs={itemDiffs} />
    </div>
  );
}

function RequestChangeDetails({ entry }: { entry: AuditLogEntryFull }) {
  const before = entry.before_data;
  const after = entry.after_data;

  if (entry.action === "create" || entry.action === "restore") {
    const fields = readFields(after, requestScalarFields);
    return (
      <div className="mt-2 space-y-1.5 text-sm">
        {fields.map((f) => (
          <ScalarField key={f.key} label={f.label} value={f.value} tone="added" />
        ))}
      </div>
    );
  }

  if (entry.action === "delete") {
    const fields = readFields(before, requestScalarFields);
    const comments = get(before, "comments");
    return (
      <div className="mt-2 space-y-1.5 text-sm">
        {fields.map((f) => (
          <ScalarField key={f.key} label={f.label} value={f.value} tone="removed" />
        ))}
        {Array.isArray(comments) && comments.length > 0 && (
          <p className="text-xs text-muted-foreground">Переписка: {comments.length} сообщ.</p>
        )}
      </div>
    );
  }

  // update
  const scalarDiffs = diffScalars(before, after, requestScalarFields);
  if (scalarDiffs.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">Изменений в данных не найдено.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5 text-sm">
      {scalarDiffs.map((d) => (
        <ScalarDiffRow key={d.key} diff={d} />
      ))}
    </div>
  );
}

function ChangeDetails({ entry }: { entry: AuditLogEntryFull }) {
  return entry.entity_type === "record" ? (
    <RecordChangeDetails entry={entry} />
  ) : (
    <RequestChangeDetails entry={entry} />
  );
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
                      <ChangeDetails entry={full} />
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
