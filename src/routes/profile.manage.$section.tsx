import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Check, ClipboardList, Ruler, Trash2, Users, UserCog } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { roleLabels, type Role } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/profile/manage/$section")({
  head: () => ({
    meta: [
      { title: "Управление справочниками — Учёт работ" },
      {
        name: "description",
        content:
          "Администрирование: виды работ, сотрудники, объекты, единицы измерения и пользователи с пакетной загрузкой.",
      },
      { property: "og:title", content: "Управление справочниками — Учёт работ" },
      {
        property: "og:description",
        content: "Добавление, редактирование и пакетная загрузка справочников приложения.",
      },
    ],
  }),
  component: ManagePage,
});

const sections = [
  { key: "work-types", label: "Виды работ — справочник", icon: ClipboardList },
  { key: "employees", label: "Сотрудники (исполнители)", icon: Users },
  { key: "objects", label: "Объекты", icon: Building2 },
  { key: "units", label: "Единицы измерения", icon: Ruler },
  { key: "users", label: "Пользователи", icon: UserCog },
] as const;

const input =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";
const primaryBtn =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90";
const ghostBtn =
  "rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted";

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Bulk({
  title,
  placeholder,
  button,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  button: string;
  onSubmit: (lines: string[]) => Promise<number>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Card title={title}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={placeholder}
        className={cn(input, "min-h-[200px] resize-y font-mono text-xs leading-relaxed")}
      />
      <button
        type="button"
        disabled={saving}
        className={cn(primaryBtn, "disabled:opacity-60")}
        onClick={async () => {
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          if (!lines.length) {
            toast.error("Вставьте данные для загрузки");
            return;
          }
          setSaving(true);
          try {
            const n = await onSubmit(lines);
            setText("");
            toast.success(`Загружено позиций: ${n}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Не удалось загрузить");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Загрузка..." : button}
      </button>
    </Card>
  );
}

function Autocomplete({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const found = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className={input}
      />
      {q.trim() && (
        <ul className="mt-2 max-h-56 overflow-auto rounded-xl border border-border bg-surface">
          {found.slice(0, 30).map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(i.id);
                  setQ("");
                }}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm break-words whitespace-normal hover:bg-muted",
                  value === i.id && "bg-primary/10 text-primary",
                )}
              >
                {i.label}
              </button>
            </li>
          ))}
          {!found.length && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ManagePage() {
  const { section } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useApp();
  const active = sections.find((s) => s.key === section) ?? sections[0];

  if (role !== "admin") {
    return (
      <AppShell>
        <PageHeading context="Управление" title="Доступ ограничен" />
        <p className="mt-3 text-sm text-muted-foreground">
          Раздел «Управление» доступен только администратору.
        </p>
        <Link to="/profile" className={cn(primaryBtn, "mt-4 inline-block")}>
          Вернуться в профиль
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeading context="Администрирование" title="Управление" />

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        {/* section list */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:w-[280px] lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0">
          {sections.map((s) => {
            const on = s.key === active.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  navigate({ to: "/profile/manage/$section", params: { section: s.key } })
                }
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold whitespace-nowrap lg:w-full lg:whitespace-normal",
                  on
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                <s.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{s.label}</span>
                {on && <Check className="hidden size-4 shrink-0 lg:block" />}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {active.key === "work-types" && <WorkTypesSection />}
          {active.key === "employees" && <EmployeesSection />}
          {active.key === "objects" && <ObjectsSection />}
          {active.key === "units" && <UnitsSection />}
          {active.key === "users" && <UsersSection />}

          <p className="mt-4 text-xs text-muted-foreground">
            Изменения сразу видны всем, у кого открыта эта страница — обновлять или рассылать файл
            заново не нужно.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:gap-6">
      <div className="space-y-4">{left}</div>
      <div className="space-y-4">{right}</div>
    </div>
  );
}

/* 1. Виды работ */
function WorkTypesSection() {
  const { workTypes, units, addWorkType, updateWorkType, deleteWorkType } = useApp();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const edited = workTypes.find((w) => w.id === editId);
  const [draft, setDraft] = useState({ name: "", unit: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const select = (id: string) => {
    const w = workTypes.find((x) => x.id === id);
    if (!w) return;
    setEditId(id);
    setDraft({ name: w.name, unit: w.unit, price: String(w.price) });
  };

  return (
    <>
      <TwoCol
        left={
          <>
            <Card title="Добавить одну позицию">
              <label className="block">
                <span className="label-caps">Название вида работ</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cn(input, "mt-1")}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label-caps">Ед. изм.</span>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    list="units-list"
                    placeholder="м², м.п, шт"
                    className={cn(input, "mt-1")}
                  />
                  <datalist id="units-list">
                    {units.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="label-caps">Цена, руб./ед.</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    className={cn(input, "mt-1")}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={adding}
                className={cn(primaryBtn, "disabled:opacity-60")}
                onClick={async () => {
                  if (!name.trim() || !unit.trim()) {
                    toast.error("Заполните название и ед. изм.");
                    return;
                  }
                  setAdding(true);
                  try {
                    await addWorkType({
                      name: name.trim(),
                      unit: unit.trim(),
                      price: Number(price) || 0,
                    });
                    setName("");
                    setUnit("");
                    setPrice("");
                    toast.success("Добавлено в справочник");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Не удалось добавить");
                  } finally {
                    setAdding(false);
                  }
                }}
              >
                {adding ? "Сохранение..." : "Добавить в справочник"}
              </button>
            </Card>

            <Card title="Изменить или удалить">
              <Autocomplete
                items={workTypes.map((w) => ({ id: w.id, label: w.name }))}
                value={editId}
                onChange={select}
                placeholder="Начните вводить название..."
              />
              {edited && (
                <div className="space-y-3 rounded-xl bg-surface p-3">
                  <label className="block">
                    <span className="label-caps">Название</span>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className={cn(input, "mt-1 bg-card")}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="label-caps">Ед. изм.</span>
                      <input
                        value={draft.unit}
                        onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                        className={cn(input, "mt-1 bg-card")}
                      />
                    </label>
                    <label className="block">
                      <span className="label-caps">Цена, руб./ед.</span>
                      <input
                        value={draft.price}
                        onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                        className={cn(input, "mt-1 bg-card")}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      className={cn(primaryBtn, "disabled:opacity-60")}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await updateWorkType(editId, {
                            name: draft.name.trim(),
                            unit: draft.unit.trim(),
                            price: Number(String(draft.price).replace(",", ".")) || 0,
                          });
                          toast.success("Сохранено");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      className={cn(ghostBtn, "text-status-rejected disabled:opacity-60")}
                      onClick={async () => {
                        setRemoving(true);
                        try {
                          await deleteWorkType(editId);
                          setEditId("");
                          toast.success("Удалено");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Не удалось удалить");
                        } finally {
                          setRemoving(false);
                        }
                      }}
                    >
                      <Trash2 className="mr-1 inline size-3.5" />
                      {removing ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </>
        }
        right={
          <Bulk
            title="Пакетная загрузка"
            button="Загрузить позиции"
            placeholder={
              "Формат: Название [Tab или ;] Ед.изм. [Tab или ;] Цена\n\nПример:\nМонтаж плинтуса;м.п;350\nШтукатурка стен;м²;620\n\nМожно вставлять прямо из Excel — колонки разделяются табуляцией."
            }
            onSubmit={async (lines) => {
              const parsed = lines
                .map((l) => l.split(/\t|;/).map((s) => s.trim()))
                .filter((p) => p[0]);
              let ok = 0;
              for (const p of parsed) {
                try {
                  await addWorkType({
                    name: p[0]!,
                    unit: p[1] || "шт",
                    price: Number((p[2] || "0").replace(",", ".")) || 0,
                  });
                  ok++;
                } catch {
                  /* пропускаем строку, которая не загрузилась, и продолжаем остальные */
                }
              }
              return ok;
            }}
          />
        }
      />
      <WorkTypesList />
    </>
  );
}

function WorkTypesList() {
  const { workTypes, updateWorkType, deleteWorkType } = useApp();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState("");
  const [draft, setDraft] = useState({ name: "", unit: "", price: "" });
  const [confirmId, setConfirmId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? workTypes.filter((w) => w.name.toLowerCase().includes(s)) : workTypes;
  }, [workTypes, q]);

  const perPage = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * perPage, current * perPage + perPage);

  const open = (id: string) => {
    const w = workTypes.find((x) => x.id === id);
    if (!w) return;
    setConfirmId("");
    if (openId === id) {
      setOpenId("");
      return;
    }
    setOpenId(id);
    setDraft({ name: w.name, unit: w.unit, price: String(w.price) });
  };

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Все виды работ</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Всего позиций: {filtered.length}. Нажмите на строку, чтобы отредактировать или удалить.
            Удаление не затрагивает уже сохранённые записи.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Поиск по названию..."
          className={cn(input, "sm:w-72")}
        />
      </div>

      <ul className="mt-3 max-h-[min(70vh,900px)] divide-y divide-border overflow-auto rounded-xl border border-border">
        {slice.map((w, i) => (
          <li key={w.id} className="bg-surface">
            <button
              type="button"
              onClick={() => open(w.id)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted",
                openId === w.id && "bg-primary/10",
              )}
            >
              <span className="w-8 shrink-0 pt-0.5 text-xs text-muted-foreground">
                {current * perPage + i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm break-words whitespace-normal">{w.name}</span>
              <span className="shrink-0 rounded-lg bg-card px-2 py-0.5 text-xs text-muted-foreground">
                {w.unit}
              </span>
              <span className="w-24 shrink-0 text-right text-sm font-semibold">
                {w.price.toLocaleString("ru-RU")} ₽
              </span>
            </button>

            {openId === w.id && (
              <div className="space-y-3 border-t border-border bg-card p-3">
                <label className="block">
                  <span className="label-caps">Название</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className={cn(input, "mt-1")}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label-caps">Ед. изм.</span>
                    <input
                      value={draft.unit}
                      onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                      className={cn(input, "mt-1")}
                    />
                  </label>
                  <label className="block">
                    <span className="label-caps">Цена, руб./ед.</span>
                    <input
                      value={draft.price}
                      onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                      inputMode="decimal"
                      className={cn(input, "mt-1")}
                    />
                  </label>
                </div>
                {confirmId === w.id ? (
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-sm">
                      Удалить «{w.name}» из справочника? В сохранённых записях этот вид работ
                      останется.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={removing}
                        className={cn(primaryBtn, "bg-status-rejected disabled:opacity-60")}
                        onClick={async () => {
                          setRemoving(true);
                          try {
                            await deleteWorkType(w.id);
                            setConfirmId("");
                            setOpenId("");
                            toast.success("Вид работ удалён из справочника");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Не удалось удалить");
                          } finally {
                            setRemoving(false);
                          }
                        }}
                      >
                        {removing ? "Удаление..." : "Да, удалить"}
                      </button>
                      <button type="button" className={ghostBtn} onClick={() => setConfirmId("")}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      className={cn(primaryBtn, "disabled:opacity-60")}
                      onClick={async () => {
                        if (!draft.name.trim() || !draft.unit.trim()) {
                          toast.error("Заполните название и ед. изм.");
                          return;
                        }
                        setSaving(true);
                        try {
                          await updateWorkType(w.id, {
                            name: draft.name.trim(),
                            unit: draft.unit.trim(),
                            price: Number(String(draft.price).replace(",", ".")) || 0,
                          });
                          setOpenId("");
                          toast.success("Сохранено");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      className={cn(ghostBtn, "text-status-rejected")}
                      onClick={() => setConfirmId(w.id)}
                    >
                      <Trash2 className="mr-1 inline size-3.5" />
                      Удалить
                    </button>
                    <button type="button" className={ghostBtn} onClick={() => setOpenId("")}>
                      Закрыть
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {!slice.length && (
          <li className="bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
            Ничего не найдено
          </li>
        )}
      </ul>

      {pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ghostBtn}
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Назад
          </button>
          <span className="text-xs text-muted-foreground">
            Страница {current + 1} из {pages}
          </span>
          <button
            type="button"
            className={ghostBtn}
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Вперёд
          </button>
        </div>
      )}
    </section>
  );
}

/* Общая секция для строковых справочников */
function StringSection({
  addTitle,
  fieldLabel,
  addButton,
  bulkPlaceholder,
  bulkButton,
  searchPlaceholder,
  items,
  onAdd,
  onBulk,
  onRename,
  onRemove,
}: {
  addTitle: string;
  fieldLabel: string;
  addButton: string;
  bulkPlaceholder: string;
  bulkButton: string;
  searchPlaceholder: string;
  items: { id: string; label: string }[];
  onAdd: (v: string) => Promise<void>;
  onBulk: (lines: string[]) => Promise<number>;
  onRename: (id: string, v: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const edited = items.find((i) => i.id === editId);

  return (
    <TwoCol
      left={
        <>
          <Card title={addTitle}>
            <label className="block">
              <span className="label-caps">{fieldLabel}</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={cn(input, "mt-1")}
              />
            </label>
            <button
              type="button"
              disabled={adding}
              className={cn(primaryBtn, "disabled:opacity-60")}
              onClick={async () => {
                if (!value.trim()) {
                  toast.error("Заполните поле");
                  return;
                }
                setAdding(true);
                try {
                  await onAdd(value.trim());
                  setValue("");
                  toast.success("Добавлено");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Не удалось добавить");
                } finally {
                  setAdding(false);
                }
              }}
            >
              {adding ? "Сохранение..." : addButton}
            </button>
          </Card>

          <Card title="Изменить или удалить">
            <Autocomplete
              items={items}
              value={editId}
              onChange={(id) => {
                setEditId(id);
                setDraft(items.find((i) => i.id === id)?.label ?? "");
              }}
              placeholder={searchPlaceholder}
            />
            {edited && (
              <div className="space-y-3 rounded-xl bg-surface p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={cn(input, "bg-card")}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className={cn(primaryBtn, "disabled:opacity-60")}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onRename(editId, draft.trim());
                        toast.success("Сохранено");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {saving ? "Сохранение..." : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    disabled={removing}
                    className={cn(ghostBtn, "text-status-rejected disabled:opacity-60")}
                    onClick={async () => {
                      setRemoving(true);
                      try {
                        await onRemove(editId);
                        setEditId("");
                        toast.success("Удалено");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Не удалось удалить");
                      } finally {
                        setRemoving(false);
                      }
                    }}
                  >
                    <Trash2 className="mr-1 inline size-3.5" />
                    {removing ? "Удаление..." : "Удалить"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      }
      right={
        <Bulk
          title="Пакетная загрузка"
          button={bulkButton}
          placeholder={bulkPlaceholder}
          onSubmit={onBulk}
        />
      }
    />
  );
}

/* 2. Сотрудники */
function EmployeesSection() {
  const { employees, addEmployee, renameEmployee, deleteEmployee } = useApp();
  const [full, setFull] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .listEmployeesFull()
      .then(setFull)
      .catch(() => toast.error("Не удалось загрузить сотрудников"));
  }, [employees]);

  return (
    <StringSection
      addTitle="Добавить сотрудника"
      fieldLabel="ФИО сотрудника"
      addButton="Добавить сотрудника"
      bulkButton="Загрузить сотрудников"
      bulkPlaceholder={"По одному ФИО на строку\n\nПример:\nИванов И.И.\nПетров П.П."}
      searchPlaceholder="Начните вводить ФИО..."
      items={full.map((e) => ({ id: e.id, label: e.name }))}
      onAdd={(v) => addEmployee(v)}
      onBulk={async (lines) => {
        let ok = 0;
        for (const line of lines) {
          try {
            await addEmployee(line);
            ok++;
          } catch {
            /* пропускаем строку, которая не загрузилась, и продолжаем остальные */
          }
        }
        return ok;
      }}
      onRename={(id, v) => renameEmployee(id, v)}
      onRemove={(id) => deleteEmployee(id)}
    />
  );
}

/* 3. Объекты */
function ObjectsSection() {
  const { objects, addObject, updateObject, deleteObject } = useApp();
  return (
    <StringSection
      addTitle="Добавить объект"
      fieldLabel="Название объекта"
      addButton="Добавить объект"
      bulkButton="Загрузить объекты"
      bulkPlaceholder={
        "По одному названию объекта на строку\n\nПример:\nОбъект №42\nСклад на Заречной"
      }
      searchPlaceholder="Начните вводить название объекта..."
      items={objects.map((o) => ({ id: o.id, label: o.name }))}
      onAdd={async (v) => {
        await addObject({ name: v, address: "Адрес уточняется", progress_percent: 0 });
      }}
      onBulk={async (lines) => {
        let ok = 0;
        for (const name of lines) {
          try {
            await addObject({ name, address: "Адрес уточняется", progress_percent: 0 });
            ok++;
          } catch {
            /* пропускаем строку, которая не загрузилась, и продолжаем остальные */
          }
        }
        return ok;
      }}
      onRename={async (id, v) => {
        const obj = objects.find((o) => o.id === id);
        await updateObject(id, {
          name: v,
          address: obj?.address ?? "Адрес уточняется",
          progress_percent: obj?.progress_percent ?? 0,
        });
      }}
      onRemove={(id) => deleteObject(id)}
    />
  );
}

/* 4. Единицы измерения */
function UnitsSection() {
  const { units, workTypes, addUnit, renameUnit, deleteUnit } = useApp();
  const [full, setFull] = useState<{ id: string; name: string }[]>([]);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    api
      .listUnitsFull()
      .then(setFull)
      .catch(() => toast.error("Не удалось загрузить единицы измерения"));
  };

  useEffect(refresh, [units]);

  const missing = useMemo(
    () => [...new Set(workTypes.map((w) => w.unit).filter((u) => u && !units.includes(u)))],
    [workTypes, units],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2 2xl:gap-6">
        <Card title="Подтянуть из справочника">
          <p className="text-sm text-muted-foreground">
            {missing.length
              ? `В справочнике видов работ уже используются единицы, которых нет в этом списке (${missing.length}): ${missing.join("; ")}. Можно добавить их сюда одной кнопкой.`
              : "Все единицы из справочника видов работ уже есть в списке."}
          </p>
          <button
            type="button"
            disabled={!missing.length}
            className={cn(primaryBtn, !missing.length && "opacity-50")}
            onClick={async () => {
              let ok = 0;
              for (const u of missing) {
                try {
                  await addUnit(u);
                  ok++;
                } catch {
                  /* пропускаем */
                }
              }
              toast.success(`Добавлено единиц: ${ok}`);
            }}
          >
            Добавить из справочника
          </button>
        </Card>

        <Card title="Добавить единицу измерения">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Например: м.п, м2, шт"
            className={input}
          />
          <button
            type="button"
            disabled={adding}
            className={cn(primaryBtn, "disabled:opacity-60")}
            onClick={async () => {
              if (!value.trim()) {
                toast.error("Введите единицу");
                return;
              }
              setAdding(true);
              try {
                await addUnit(value.trim());
                setValue("");
                toast.success("Добавлено");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Не удалось добавить");
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? "Сохранение..." : "Добавить единицу"}
          </button>
        </Card>
      </div>

      <Bulk
        title="Пакетная загрузка"
        button="Загрузить единицы"
        placeholder={"По одной единице измерения на строку\n\nПример:\nм.п\nм2\nшт"}
        onSubmit={async (lines) => {
          let ok = 0;
          for (const line of lines) {
            try {
              await addUnit(line);
              ok++;
            } catch {
              /* пропускаем строку, которая не загрузилась, и продолжаем остальные */
            }
          }
          return ok;
        }}
      />

      <Card
        title="Изменить или удалить единицу"
        hint="Список полностью помещается на экране — отдельный поиск не нужен"
      >
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-xl bg-surface">
          {full.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              {editId === u.id ? (
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={cn(input, "bg-card")}
                />
              ) : (
                <span className="font-medium">{u.name}</span>
              )}
              <span className="flex shrink-0 gap-2">
                {editId === u.id ? (
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    className={cn(ghostBtn, "disabled:opacity-60")}
                    onClick={async () => {
                      setBusyId(u.id);
                      try {
                        await renameUnit(u.id, draft.trim() || u.name);
                        setEditId("");
                        toast.success("Сохранено");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => {
                      setEditId(u.id);
                      setDraft(u.name);
                    }}
                  >
                    Изменить
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === u.id}
                  className={cn(ghostBtn, "text-status-rejected disabled:opacity-60")}
                  onClick={async () => {
                    setBusyId(u.id);
                    try {
                      await deleteUnit(u.id);
                      toast.success("Удалено");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Не удалось удалить");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Удалить
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* 5. Пользователи */

// Пароли на backend хранятся только как bcrypt-хэш (одностороннее шифрование) —
// показать "старый" пароль в принципе невозможно ни при каких правах доступа,
// это не баг, а требование безопасности. Единственная рабочая операция — задать
// новый пароль (вручную или сгенерировать), после чего он сразу необратимо хэшируется.
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function UsersSection() {
  const { users, addUser, updateUser } = useApp();
  const [form, setForm] = useState({
    login: "",
    password: "",
    full_name: "",
    role: "user" as Role,
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState({ full_name: "", role: "user" as Role, newPassword: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  return (
    <div className="space-y-4">
      <Card title="Добавить пользователя">
        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1.4fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="label-caps">Логин</span>
            <input
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              className={cn(input, "mt-1")}
            />
          </label>
          <label className="block">
            <span className="label-caps">Пароль</span>
            <div className="mt-1 flex gap-1.5">
              <input
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className={cn(input, "font-mono")}
              />
              <button
                type="button"
                className={cn(ghostBtn, "shrink-0 px-2.5")}
                onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
              >
                Сгенерировать
              </button>
            </div>
          </label>
          <label className="block">
            <span className="label-caps">ФИО</span>
            <input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className={cn(input, "mt-1")}
            />
          </label>
          <label className="block">
            <span className="label-caps">Роль</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              className={cn(input, "mt-1")}
            >
              <option value="user">Обычный пользователь</option>
              <option value="curator">Куратор</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <button
            type="button"
            disabled={saving}
            className={cn(primaryBtn, "disabled:opacity-60")}
            onClick={async () => {
              if (!form.login.trim() || !form.full_name.trim() || !form.password.trim()) {
                toast.error("Заполните логин, пароль и ФИО");
                return;
              }
              setSaving(true);
              try {
                await addUser({
                  login: form.login.trim(),
                  password: form.password,
                  full_name: form.full_name.trim(),
                  role: form.role,
                });
                setForm({ login: "", password: "", full_name: "", role: "user" });
                toast.success("Пользователь добавлен");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Не удалось добавить пользователя",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Сохранение..." : "Добавить пользователя"}
          </button>
        </div>
      </Card>

      <Card title="Все пользователи">
        <ul className="divide-y divide-border rounded-xl bg-surface">
          {users.map((u) => (
            <li key={u.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {u.full_name}
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                      {u.login}
                    </span>
                    {u.active === false && (
                      <span className="rounded-md bg-status-rejected/10 px-2 py-0.5 text-[11px] font-semibold text-status-rejected">
                        Отключён
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{roleLabels[u.role]}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => {
                      setEditId((e) => (e === u.id ? "" : u.id));
                      setDraft({ full_name: u.full_name, role: u.role, newPassword: "" });
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className={cn(ghostBtn, u.active === false ? "" : "text-status-rejected")}
                    onClick={async () => {
                      try {
                        await updateUser(u.id, { active: u.active === false });
                        toast.success(
                          u.active === false ? "Пользователь включён" : "Пользователь отключён",
                        );
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Не удалось изменить статус",
                        );
                      }
                    }}
                  >
                    {u.active === false ? "Включить" : "Отключить"}
                  </button>
                </div>
              </div>

              {editId === u.id && (
                <div className="mt-3 space-y-3 rounded-xl bg-card p-3">
                  <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
                    <label className="block">
                      <span className="label-caps">ФИО</span>
                      <input
                        value={draft.full_name}
                        onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                        className={cn(input, "mt-1")}
                      />
                    </label>
                    <label className="block">
                      <span className="label-caps">Роль</span>
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Role }))}
                        className={cn(input, "mt-1")}
                      >
                        <option value="user">Обычный пользователь</option>
                        <option value="curator">Куратор</option>
                        <option value="admin">Администратор</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="label-caps">
                      Новый пароль (оставьте пустым, чтобы не менять)
                    </span>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        value={draft.newPassword}
                        onChange={(e) => setDraft((d) => ({ ...d, newPassword: e.target.value }))}
                        placeholder="Не менять"
                        className={cn(input, "font-mono")}
                      />
                      <button
                        type="button"
                        className={cn(ghostBtn, "shrink-0 px-2.5")}
                        onClick={() => setDraft((d) => ({ ...d, newPassword: generatePassword() }))}
                      >
                        Сгенерировать
                      </button>
                    </div>
                  </label>
                  <button
                    type="button"
                    disabled={savingEdit}
                    className={cn(primaryBtn, "disabled:opacity-60")}
                    onClick={async () => {
                      setSavingEdit(true);
                      try {
                        const newPassword = draft.newPassword.trim();
                        await updateUser(editId, {
                          full_name: draft.full_name.trim(),
                          role: draft.role,
                          ...(newPassword ? { password: newPassword } : {}),
                        });
                        toast.success(
                          newPassword
                            ? `Сохранено. Новый пароль: ${newPassword} — сообщите его пользователю, повторно он нигде не отобразится.`
                            : "Сохранено",
                        );
                        setEditId("");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
                      } finally {
                        setSavingEdit(false);
                      }
                    }}
                  >
                    {savingEdit ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
