import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ClipboardList,
  Ruler,
  Trash2,
  Users,
  UserCog,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
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
  onSubmit: (lines: string[]) => number;
}) {
  const [text, setText] = useState("");
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
        className={primaryBtn}
        onClick={() => {
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          if (!lines.length) { toast.error("Вставьте данные для загрузки"); return; }
          const n = onSubmit(lines);
          setText("");
          toast.success(`Загружено позиций: ${n}`);
        }}
      >
        {button}
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
                onClick={() => navigate({ to: "/profile/manage/$section", params: { section: s.key } })}
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
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">{left}</div>
      <div className="space-y-4">{right}</div>
    </div>
  );
}

/* 1. Виды работ */
function WorkTypesSection() {
  const { workTypes, setWorkTypes, units } = useApp();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [editId, setEditId] = useState("");
  const edited = workTypes.find((w) => w.id === editId);
  const [draft, setDraft] = useState({ name: "", unit: "", price: "" });

  const select = (id: string) => {
    const w = workTypes.find((x) => x.id === id);
    if (!w) return;
    setEditId(id);
    setDraft({ name: w.name, unit: w.unit, price: String(w.price) });
  };

  return (
    <TwoCol
      left={
        <>
          <Card title="Добавить одну позицию">
            <label className="block">
              <span className="label-caps">Название вида работ</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "mt-1")} />
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
              className={primaryBtn}
              onClick={() => {
                if (!name.trim() || !unit.trim()) { toast.error("Заполните название и ед. изм."); return; }
                setWorkTypes((p) => [
                  ...p,
                  { id: `w${Date.now()}`, name: name.trim(), unit: unit.trim(), price: Number(price) || 0 },
                ]);
                setName("");
                setUnit("");
                setPrice("");
                toast.success("Добавлено в справочник");
              }}
            >
              Добавить в справочник
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
                    className={primaryBtn}
                    onClick={() => {
                      setWorkTypes((p) =>
                        p.map((w) =>
                          w.id === editId
                            ? { ...w, name: draft.name.trim(), unit: draft.unit.trim(), price: Number(draft.price) || 0 }
                            : w,
                        ),
                      );
                      toast.success("Сохранено");
                    }}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className={cn(ghostBtn, "text-status-rejected")}
                    onClick={() => {
                      setWorkTypes((p) => p.filter((w) => w.id !== editId));
                      setEditId("");
                      toast.success("Удалено");
                    }}
                  >
                    <Trash2 className="mr-1 inline size-3.5" />
                    Удалить
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
          onSubmit={(lines) => {
            const parsed = lines
              .map((l) => l.split(/\t|;/).map((s) => s.trim()))
              .filter((p) => p[0]);
            setWorkTypes((prev) => [
              ...prev,
              ...parsed.map((p, i) => ({
                id: `w${Date.now()}${i}`,
                name: p[0]!,
                unit: p[1] || "шт",
                price: Number((p[2] || "0").replace(",", ".")) || 0,
              })),
            ]);
            return parsed.length;
          }}
        />
      }
    />
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
  onAdd: (v: string) => void;
  onBulk: (lines: string[]) => number;
  onRename: (id: string, v: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState("");
  const edited = items.find((i) => i.id === editId);

  return (
    <TwoCol
      left={
        <>
          <Card title={addTitle}>
            <label className="block">
              <span className="label-caps">{fieldLabel}</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} className={cn(input, "mt-1")} />
            </label>
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                if (!value.trim()) { toast.error("Заполните поле"); return; }
                onAdd(value.trim());
                setValue("");
                toast.success("Добавлено");
              }}
            >
              {addButton}
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
                    className={primaryBtn}
                    onClick={() => {
                      onRename(editId, draft.trim());
                      toast.success("Сохранено");
                    }}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className={cn(ghostBtn, "text-status-rejected")}
                    onClick={() => {
                      onRemove(editId);
                      setEditId("");
                      toast.success("Удалено");
                    }}
                  >
                    <Trash2 className="mr-1 inline size-3.5" />
                    Удалить
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
  const { employees, setEmployees } = useApp();
  return (
    <StringSection
      addTitle="Добавить сотрудника"
      fieldLabel="ФИО сотрудника"
      addButton="Добавить сотрудника"
      bulkButton="Загрузить сотрудников"
      bulkPlaceholder={"По одному ФИО на строку\n\nПример:\nИванов И.И.\nПетров П.П."}
      searchPlaceholder="Начните вводить ФИО..."
      items={employees.map((e) => ({ id: e, label: e }))}
      onAdd={(v) => setEmployees((p) => [...p, v])}
      onBulk={(lines) => {
        setEmployees((p) => [...p, ...lines]);
        return lines.length;
      }}
      onRename={(id, v) => setEmployees((p) => p.map((e) => (e === id ? v : e)))}
      onRemove={(id) => setEmployees((p) => p.filter((e) => e !== id))}
    />
  );
}

/* 3. Объекты */
function ObjectsSection() {
  const { objects, setObjects } = useApp();
  return (
    <StringSection
      addTitle="Добавить объект"
      fieldLabel="Название объекта"
      addButton="Добавить объект"
      bulkButton="Загрузить объекты"
      bulkPlaceholder={"По одному названию объекта на строку\n\nПример:\nОбъект №42\nСклад на Заречной"}
      searchPlaceholder="Начните вводить название объекта..."
      items={objects.map((o) => ({ id: o.id, label: o.name }))}
      onAdd={(v) =>
        setObjects((p) => [
          ...p,
          { id: `o${Date.now()}`, name: v, address: "Адрес уточняется", records_today: 0, progress_percent: 0 },
        ])
      }
      onBulk={(lines) => {
        setObjects((p) => [
          ...p,
          ...lines.map((name, i) => ({
            id: `o${Date.now()}${i}`,
            name,
            address: "Адрес уточняется",
            records_today: 0,
            progress_percent: 0,
          })),
        ]);
        return lines.length;
      }}
      onRename={(id, v) => setObjects((p) => p.map((o) => (o.id === id ? { ...o, name: v } : o)))}
      onRemove={(id) => setObjects((p) => p.filter((o) => o.id !== id))}
    />
  );
}

/* 4. Единицы измерения */
function UnitsSection() {
  const { units, setUnits, workTypes } = useApp();
  const [value, setValue] = useState("");
  const [editKey, setEditKey] = useState("");
  const [draft, setDraft] = useState("");

  const missing = useMemo(
    () => [...new Set(workTypes.map((w) => w.unit).filter((u) => u && !units.includes(u)))],
    [workTypes, units],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
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
            onClick={() => {
              setUnits((p) => [...p, ...missing]);
              toast.success(`Добавлено единиц: ${missing.length}`);
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
            className={primaryBtn}
            onClick={() => {
              if (!value.trim()) { toast.error("Введите единицу"); return; }
              setUnits((p) => [...p, value.trim()]);
              setValue("");
              toast.success("Добавлено");
            }}
          >
            Добавить единицу
          </button>
        </Card>
      </div>

      <Bulk
        title="Пакетная загрузка"
        button="Загрузить единицы"
        placeholder={"По одной единице измерения на строку\n\nПример:\nм.п\nм2\nшт"}
        onSubmit={(lines) => {
          setUnits((p) => [...p, ...lines]);
          return lines.length;
        }}
      />

      <Card
        title="Изменить или удалить единицу"
        hint="Список полностью помещается на экране — отдельный поиск не нужен"
      >
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-xl bg-surface">
          {units.map((u) => (
            <li key={u} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              {editKey === u ? (
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={cn(input, "bg-card")}
                />
              ) : (
                <span className="font-medium">{u}</span>
              )}
              <span className="flex shrink-0 gap-2">
                {editKey === u ? (
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => {
                      setUnits((p) => p.map((x) => (x === u ? draft.trim() || x : x)));
                      setEditKey("");
                      toast.success("Сохранено");
                    }}
                  >
                    Сохранить
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => {
                      setEditKey(u);
                      setDraft(u);
                    }}
                  >
                    Изменить
                  </button>
                )}
                <button
                  type="button"
                  className={cn(ghostBtn, "text-status-rejected")}
                  onClick={() => {
                    setUnits((p) => p.filter((x) => x !== u));
                    toast.success("Удалено");
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
function UsersSection() {
  const { users, setUsers } = useApp();
  const [form, setForm] = useState({ login: "", password: "", full_name: "", role: "user" as Role });
  const [shown, setShown] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState({ login: "", password: "", full_name: "", role: "user" as Role });

  return (
    <div className="space-y-4">
      <Card title="Добавить пользователя">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_1fr_auto] md:items-end">
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
            <input
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={cn(input, "mt-1")}
            />
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
            className={primaryBtn}
            onClick={() => {
              if (!form.login.trim() || !form.full_name.trim())
                { toast.error("Заполните логин и ФИО"); return; }
              setUsers((p) => [...p, { id: `u${Date.now()}`, ...form, login: form.login.trim(), full_name: form.full_name.trim() }]);
              setForm({ login: "", password: "", full_name: "", role: "user" });
              toast.success("Пользователь добавлен");
            }}
          >
            Добавить пользователя
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
                  </p>
                  <p className="text-xs text-muted-foreground">{roleLabels[u.role]}</p>
                  {shown === u.id && (
                    <p className="mt-1 font-mono text-xs">Пароль: {u.password}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => setShown((s) => (s === u.id ? null : u.id))}
                  >
                    Пароль
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => {
                      setEditId((e) => (e === u.id ? "" : u.id));
                      setDraft({ login: u.login, password: u.password, full_name: u.full_name, role: u.role });
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className={cn(ghostBtn, "text-status-rejected")}
                    onClick={() => {
                      setUsers((p) => p.filter((x) => x.id !== u.id));
                      toast.success("Удалено");
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              {editId === u.id && (
                <div className="mt-3 grid gap-3 rounded-xl bg-card p-3 md:grid-cols-[1fr_1fr_1.4fr_1fr_auto] md:items-end">
                  <input
                    value={draft.login}
                    onChange={(e) => setDraft((d) => ({ ...d, login: e.target.value }))}
                    className={input}
                  />
                  <input
                    value={draft.password}
                    onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                    className={input}
                  />
                  <input
                    value={draft.full_name}
                    onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                    className={input}
                  />
                  <select
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Role }))}
                    className={input}
                  >
                    <option value="user">Обычный пользователь</option>
                    <option value="curator">Куратор</option>
                    <option value="admin">Администратор</option>
                  </select>
                  <button
                    type="button"
                    className={primaryBtn}
                    onClick={() => {
                      setUsers((p) => p.map((x) => (x.id === editId ? { ...x, ...draft } : x)));
                      setEditId("");
                      toast.success("Сохранено");
                    }}
                  >
                    Сохранить
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
