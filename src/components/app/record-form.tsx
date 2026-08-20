import { useNavigate } from "@tanstack/react-router";
import { Camera, Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldLabel, PageHeading } from "@/components/app/bits";
import { EmployeeSelect } from "@/components/app/employee-select";
import { cn } from "@/lib/utils";
import { itemQty, recordTotal, round2, syncItem } from "@/lib/record-utils";
import { api } from "@/lib/api-client";
import type { ExecutionType, WorkItem, WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

function toIso(ru?: string) {
  const m = ru?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromIso(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

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
  const [photos, setPhotos] = useState<string[]>(record?.photos ?? []); // уже загруженные (URL с сервера)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // выбраны, но ещё не отправлены
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dateIso, setDateIso] = useState(() => toIso(record?.date));

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

  const save = async (status: "draft" | "done") => {
    if (status === "done" && items.length === 0) {
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
      date: fromIso(dateIso) || new Intl.DateTimeFormat("ru-RU").format(now),
      time:
        record?.time ??
        new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now),
      items,
      total,
      comment,
      photos,
      status,
      created_by: record?.created_by ?? currentUser.full_name,
      ...(record
        ? {
            updated_by: currentUser.full_name,
            updated_at: `${new Intl.DateTimeFormat("ru-RU").format(now)}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now)}`,
          }
        : {}),
    };

    setSaving(true);
    try {
      const saved = record ? await updateRecord(payload) : await addRecord(payload);
      if (pendingFiles.length > 0) {
        try {
          await api.uploadPhotos(saved.id, pendingFiles);
        } catch {
          toast.error("Запись сохранена, но фото загрузить не удалось — попробуйте добавить их ещё раз");
        }
      }
      toast.success(status === "draft" ? "Черновик сохранён" : "Запись сохранена");
      navigate({ to: "/objects/$id", params: { id: objectId } });
    } catch {
      toast.error("Не удалось сохранить запись, попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setPendingFiles((prev) => [...prev, ...arr]);
    setPendingPreviews((prev) => [...prev, ...arr.map((f) => URL.createObjectURL(f))]);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setPendingPreviews((prev) => {
      URL.revokeObjectURL(prev[idx]!);
      return prev.filter((_, i) => i !== idx);
    });
  };

  return (
    <>
      <PageHeading
        context={record ? (record.status === "draft" ? "Черновик записи" : "Редактирование записи") : "Новая запись"}
        title={`${object.name}, ${object.address}`}
      />

      <div className="mt-5 w-full space-y-5 xl:max-w-5xl 2xl:max-w-none">
        <div>
          <FieldLabel>Дата работ</FieldLabel>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
        </div>

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
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold">
              <Camera className="size-4" /> Снять фото
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold">
              <ImageIcon className="size-4" /> Из галереи
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {(photos.length > 0 || pendingPreviews.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <img key={p} src={p} alt="Фото к записи" className="size-16 rounded-lg object-cover" />
              ))}
              {pendingPreviews.map((p, idx) => (
                <div key={p} className="relative size-16">
                  <img src={p} alt="Новое фото" className="size-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    aria-label="Убрать фото"
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-0.5"
                  >
                    <X className="size-3 text-white" />
                  </button>
                </div>
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
            disabled={saving}
            className="w-full rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold disabled:opacity-60"
          >
            Сохранить черновик
          </button>
          <button
            onClick={() => save("done")}
            disabled={saving}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Сохранение..." : "Сохранить запись"}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4">
      <div className="flex max-h-[95vh] w-full max-w-6xl 2xl:max-w-[1600px] flex-col rounded-t-3xl bg-card shadow-2xl md:rounded-3xl">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 md:px-10 md:pt-10 md:pb-7">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Выбор вида работ</h2>
            <p className="mt-1.5 text-base text-muted-foreground">
              Найдите позицию в справочнике или укажите свой вариант
            </p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-full p-2.5 hover:bg-muted">
            <X className="size-6 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 md:px-10">
          <div className="relative">
            <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию..."
              className="w-full rounded-xl border border-border bg-surface py-4 pr-5 pl-12 text-base"
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span className="label-caps">Справочник</span>
            <span>
              {filtered.length} {filtered.length === 1 ? "позиция" : filtered.length < 5 ? "позиции" : "позиций"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 md:px-10 md:py-7">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-base text-muted-foreground">Ничего не найдено</p>
              <button
                onClick={() => setCustomOpen(true)}
                className="mt-3 text-base font-semibold text-primary"
              >
                Указать свой вариант
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onPick({ name: t.name, unit: t.unit, qty: 0, price: t.price })}
                    className="group flex h-full w-full flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="block text-base font-semibold leading-snug break-words whitespace-normal group-hover:text-primary">
                      {t.name}
                    </span>
                    <div className="flex w-full items-center justify-between gap-3">
                      {isAdmin && (
                        <span className="font-mono text-sm text-muted-foreground">
                          {t.price.toLocaleString("ru-RU")} ₽ / {t.unit}
                        </span>
                      )}
                      {!isAdmin && <span />}
                      <span className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.unit}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-6 py-5 md:px-10 md:py-7">
          {!customOpen ? (
            <button
              onClick={() => setCustomOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-base font-semibold text-primary transition-colors hover:bg-muted/40"
            >
              <Plus className="size-5" />
              Не нашли нужный вид работы? Указать свой вариант
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Свой вариант</span>
                <button onClick={() => setCustomOpen(false)} className="text-sm text-muted-foreground">
                  Скрыть
                </button>
              </div>
              <textarea
                rows={4}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Опишите недостающие позиции, по одной на строку"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setCustomOpen(false)}
                  className="flex-1 rounded-xl border border-border bg-surface py-3.5 text-base font-semibold"
                >
                  Отмена
                </button>
                <button
                  onClick={() => custom.trim() && onRequest(custom.trim())}
                  className="flex-1 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground"
                >
                  Отправить заявку
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

