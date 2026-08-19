import { useNavigate } from "@tanstack/react-router";
import { Camera, Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldLabel, PageHeading } from "@/components/app/bits";
import { EmployeeSelect } from "@/components/app/employee-select";
import { cn } from "@/lib/utils";
import { itemQty, recordTotal, round2, syncItem } from "@/lib/record-utils";
import type { ExecutionType, WorkItem, WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

export function RecordForm({ record }: { record?: WorkRecord }) {
  const navigate = useNavigate();
  const {
    objects,
    employees,
    brigades,
    workTypes,
    role,
    addRecord,
    updateRecord,
    setRequests,
    currentUser,
  } = useApp();

  const isAdmin = role === "admin";

  const [objectId, setObjectId] = useState(record?.object_id ?? objects[0]!.id);
  const [executionType, setExecutionType] = useState<ExecutionType>(
    record?.execution_type ?? "employee",
  );
  const [items, setItems] = useState<WorkItem[]>(record?.items ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>(
    record?.execution_type === "brigade"
      ? (record.brigade_members ?? [])
      : (record?.employees ?? []),
  );
  const [brigadeName, setBrigadeName] = useState(record?.brigade_name ?? brigades[0]!.name);
  const [comment, setComment] = useState(record?.comment ?? "");
  const [photos, setPhotos] = useState<string[]>(record?.photos ?? []);

  const object = objects.find((o) => o.id === objectId)!;
  const total = recordTotal(items);

  const applyCrew = (next: string[]) => {
    setSelectedEmployees(next);
    setItems((prev) => prev.map((it) => syncItem(it, next)));
  };

  const crew = executionType === "brigade"
    ? (brigades.find((b) => b.name === brigadeName)?.members ?? [])
    : selectedEmployees;

  const setItemCrew = (idx: number, next: string[]) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? syncItem(it, next) : it)));

  const setItemTotal = (idx: number, qty: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const base = { ...it, qty, manual: false };
        return syncItem(base, (it.allocations ?? []).map((a) => a.employee));
      }),
    );

  const setAllocation = (idx: number, employee: string, qty: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const allocations = (it.allocations ?? []).map((a) =>
          a.employee === employee ? { ...a, qty } : a,
        );
        return {
          ...it,
          manual: true,
          allocations,
          qty: round2(allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0)),
        };
      }),
    );

  const save = (status: "draft" | "in_progress") => {
    if (status === "in_progress" && items.length === 0) {
      toast.error("Добавьте хотя бы один вид работы");
      return;
    }
    const now = new Date();
    const payload: WorkRecord = {
      id: record?.id ?? `r${Date.now()}`,
      object_id: objectId,
      execution_type: executionType,
      employees: executionType === "employee" ? selectedEmployees : [],
      ...(executionType === "brigade"
        ? {
            brigade_name: brigadeName,
            brigade_members: brigades.find((b) => b.name === brigadeName)?.members ?? [],
          }
        : {}),
      date: record?.date ?? new Intl.DateTimeFormat("ru-RU").format(now),
      time:
        record?.time ??
        new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now),
      items,
      total,
      comment,
      photos,
      status,
      created_by: record?.created_by ?? currentUser.full_name,
    };
    if (record) updateRecord(payload);
    else addRecord(payload);
    toast.success(status === "draft" ? "Черновик сохранён" : "Запись сохранена");
    navigate({ to: "/objects/$id", params: { id: objectId } });
  };

  return (
    <>
      <PageHeading
        context={record ? (record.status === "draft" ? "Черновик записи" : "Редактирование записи") : "Новая запись"}
        title={`${object.name}, ${object.address}`}
      />

      <div className="mt-5 max-w-3xl space-y-5">
        <div>
          <FieldLabel>Объект</FieldLabel>
          <select
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          >
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.address}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
          {(["employee", "brigade"] as ExecutionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setExecutionType(t)}
              className={cn(
                "rounded-lg py-2.5 text-sm font-semibold transition-colors",
                executionType === t ? "bg-primary text-primary-foreground" : "text-foreground",
              )}
            >
              {t === "employee" ? "По сотруднику" : "По бригаде"}
            </button>
          ))}
        </div>

        <div>
          <FieldLabel>{executionType === "employee" ? "Состав записи" : "Бригада"}</FieldLabel>
          {executionType === "employee" ? (
            <div className="mt-1">
              <EmployeeSelect all={employees} value={selectedEmployees} onChange={applyCrew} />
            </div>
          ) : (
            <select
              value={brigadeName}
              onChange={(e) => {
                setBrigadeName(e.target.value);
                applyCrew(brigades.find((b) => b.name === e.target.value)?.members ?? []);
              }}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            >
              {brigades.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} — {b.members.join(", ")}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <FieldLabel>Виды работ · кто и сколько сделал</FieldLabel>
          <div className="mt-1 space-y-3">
            {items.map((item, idx) => {
              const itemCrew = (item.allocations ?? []).map((a) => a.employee);
              return (
                <div key={idx} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold break-words whitespace-normal">
                      {item.name}
                    </p>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Убрать позицию"
                    >
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Общий объём</span>
                      <input
                        type="number"
                        value={itemQty(item)}
                        readOnly={item.manual}
                        onChange={(e) => setItemTotal(idx, Number(e.target.value))}
                        className={cn(
                          "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm",
                          item.manual && "text-muted-foreground",
                        )}
                      />
                      <span className="text-muted-foreground">{item.unit}</span>
                    </label>
                    {isAdmin && (
                      <span className="text-sm text-muted-foreground">
                        {item.price.toLocaleString("ru-RU")} ₽ / {item.unit}
                      </span>
                    )}
                    {item.manual && (
                      <button
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? syncItem({ ...it, manual: false }, itemCrew) : it,
                            ),
                          )
                        }
                        className="text-xs font-semibold text-primary"
                      >
                        Разделить поровну
                      </button>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl bg-card p-3">
                    <FieldLabel>Разбивка по сотрудникам</FieldLabel>
                    <div className="mt-2 space-y-2">
                      {(item.allocations ?? []).map((a) => (
                        <div key={a.employee} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-sm break-words">{a.employee}</span>
                          <input
                            type="number"
                            value={a.qty}
                            onChange={(e) => setAllocation(idx, a.employee, Number(e.target.value))}
                            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
                          />
                          <span className="w-12 text-sm text-muted-foreground">{item.unit}</span>
                        </div>
                      ))}
                      {(item.allocations ?? []).length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Добавьте сотрудников в состав записи.
                        </p>
                      )}
                    </div>
                    <div className="mt-3">
                      <EmployeeSelect
                        all={employees}
                        value={itemCrew}
                        onChange={(next) => setItemCrew(idx, next)}
                        placeholder="Изменить состав"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-primary"
            >
              <Plus className="size-4" />
              {items.length === 0 ? "Выбрать вид работы" : "Ещё вид работы"}
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>Комментарий (необязательно)</FieldLabel>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Добавить примечание..."
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
        </div>

        <div>
          <FieldLabel>Фото</FieldLabel>
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => setPhotos((p) => [...p, `Фото ${p.length + 1}`])}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
            >
              <Camera className="size-4" /> Снять фото
            </button>
            <button
              onClick={() => setPhotos((p) => [...p, `Галерея ${p.length + 1}`])}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
            >
              <ImageIcon className="size-4" /> Из галереи
            </button>
          </div>
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <span
                  key={p}
                  className="flex size-16 items-center justify-center rounded-lg bg-muted text-center text-[10px] text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
            <span className="label-caps">Итого по записи</span>
            <span className="font-mono text-lg font-bold">{total.toLocaleString("ru-RU")} ₽</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => save("draft")}
            className="w-full rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold"
          >
            Сохранить черновик
          </button>
          <button
            onClick={() => save("in_progress")}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
          >
            Сохранить запись
          </button>
        </div>
      </div>

      {pickerOpen && (
        <WorkTypePicker
          isAdmin={isAdmin}
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            setItems((prev) => [...prev, syncItem(item, crew)]);
            setPickerOpen(false);
          }}
          onRequest={(text) => {
            setRequests((prev) => [
              {
                id: `q${Date.now()}`,
                author: currentUser.full_name,
                requested_text: text,
                status: "pending",
                created_at: new Intl.DateTimeFormat("ru-RU").format(new Date()),
                comments: [],
              },
              ...prev,
            ]);
            toast.success("Заявка отправлена администратору");
            setPickerOpen(false);
          }}
          types={workTypes}
        />
      )}
    </>
  );
}

function WorkTypePicker({
  types,
  onPick,
  onClose,
  onRequest,
  isAdmin,
}: {
  types: { id: string; name: string; unit: string; price: number }[];
  onPick: (item: WorkItem) => void;
  onClose: () => void;
  onRequest: (text: string) => void;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const filtered = types.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Выбор вида работ</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по справочнику..."
            className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm"
          />
        </div>

        <ul className="mt-3 space-y-1">
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onPick({ name: t.name, unit: t.unit, qty: 0, price: t.price })}
                className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal">{t.name}</span>
                <span className="shrink-0 text-right text-muted-foreground">
                  {t.unit}
                  {isAdmin && (
                    <span className="block font-mono text-xs">
                      {t.price.toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => setCustomOpen((v) => !v)}
          className="mt-3 text-sm font-semibold text-primary"
        >
          Не нашли? Указать свой вариант
        </button>
        {customOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              rows={3}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Опишите недостающие позиции, по одной на строку"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            />
            <button
              onClick={() => custom.trim() && onRequest(custom.trim())}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Отправить заявку администратору
            </button>
          </div>
        )}
      </div>
    </div>
  );
}