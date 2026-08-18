import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import type { ExecutionType, WorkItem } from "@/data/mock";
import { useApp } from "@/state/app-context";

export const Route = createFileRoute("/records/new")({
  head: () => ({
    meta: [
      { title: "Новая запись — Учёт работ" },
      {
        name: "description",
        content: "Фиксация выполненной работы: вид работы, исполнитель, объём, фото и комментарий.",
      },
      { property: "og:title", content: "Новая запись — Учёт работ" },
      { property: "og:description", content: "Форма фиксации выполненных работ на объекте." },
    ],
  }),
  component: NewRecordPage,
});

function NewRecordPage() {
  const navigate = useNavigate();
  const { objects, employees, brigades, workTypes, role, addRecord, setRequests, currentUser } =
    useApp();

  const [objectId, setObjectId] = useState(objects[0]!.id);
  const [executionType, setExecutionType] = useState<ExecutionType>("employee");
  const [items, setItems] = useState<WorkItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [brigadeName, setBrigadeName] = useState(brigades[0]!.name);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const object = objects.find((o) => o.id === objectId)!;
  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);

  const save = () => {
    if (items.length === 0) {
      toast.error("Добавьте хотя бы один вид работы");
      return;
    }
    addRecord({
      id: `r${Date.now()}`,
      object_id: objectId,
      execution_type: executionType,
      employees: executionType === "employee" ? selectedEmployees : [],
      ...(executionType === "brigade"
        ? {
            brigade_name: brigadeName,
            brigade_members: brigades.find((b) => b.name === brigadeName)?.members ?? [],
          }
        : {}),
      date: new Intl.DateTimeFormat("ru-RU").format(new Date()),
      time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(),
      ),
      items,
      total,
      comment,
      photos,
      status: "on_review",
      created_by: currentUser.full_name,
    });
    toast.success("Запись сохранена");
    navigate({ to: "/objects/$id", params: { id: objectId } });
  };

  return (
    <AppShell>
      <PageHeading context="Новая запись" title={`${object.name}, ${object.address}`} />

      <div className="mt-5 max-w-2xl space-y-5">
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
          <FieldLabel>Вид работы</FieldLabel>
          <div className="mt-1 space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((it, i) =>
                        i === idx ? { ...it, qty: Number(e.target.value) } : it,
                      ),
                    )
                  }
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
                />
                <span className="w-12 text-sm text-muted-foreground">{item.unit}</span>
                <button
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Убрать позицию"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            ))}
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
          <FieldLabel>{executionType === "employee" ? "Сотрудник" : "Бригада"}</FieldLabel>
          {executionType === "employee" ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {employees.map((e) => {
                const active = selectedEmployees.includes(e);
                return (
                  <button
                    key={e}
                    onClick={() =>
                      setSelectedEmployees((prev) =>
                        active ? prev.filter((p) => p !== e) : [...prev, e],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          ) : (
            <select
              value={brigadeName}
              onChange={(e) => setBrigadeName(e.target.value)}
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

        {role === "admin" && (
          <div className="flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
            <span className="label-caps">Итого по записи</span>
            <span className="font-mono text-lg font-bold">{total.toLocaleString("ru-RU")} ₽</span>
          </div>
        )}

        <button
          onClick={save}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
        >
          Сохранить запись
        </button>
      </div>

      {pickerOpen && (
        <WorkTypePicker
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            setItems((prev) => [...prev, item]);
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
    </AppShell>
  );
}

function WorkTypePicker({
  types,
  onPick,
  onClose,
  onRequest,
}: {
  types: { id: string; name: string; unit: string; price: number }[];
  onPick: (item: WorkItem) => void;
  onClose: () => void;
  onRequest: (text: string) => void;
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
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-muted"
              >
                <span>{t.name}</span>
                <span className="text-muted-foreground">{t.unit}</span>
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