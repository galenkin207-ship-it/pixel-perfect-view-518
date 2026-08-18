import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { roleLabels, type Role } from "@/data/mock";
import { useApp } from "@/state/app-context";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Профиль и настройки — Учёт работ" },
      {
        name: "description",
        content:
          "Данные пользователя, оформление интерфейса и администрирование справочников: сотрудники, объекты, виды работ.",
      },
      { property: "og:title", content: "Профиль и настройки — Учёт работ" },
      { property: "og:description", content: "Настройки прораба, куратора и администратора." },
    ],
  }),
  component: ProfilePage,
});

type Tab = "employees" | "objects" | "workTypes" | "users";

function ProfilePage() {
  const {
    role,
    currentUser,
    theme,
    toggleTheme,
    employees,
    setEmployees,
    objects,
    setObjects,
    workTypes,
    setWorkTypes,
    users,
  } = useApp();
  const [tab, setTab] = useState<Tab>("employees");
  const [value, setValue] = useState("");

  const isAdmin = role === "admin";

  const add = () => {
    const v = value.trim();
    if (!v) return;
    if (tab === "employees") setEmployees((p) => [...p, v]);
    if (tab === "objects")
      setObjects((p) => [
        ...p,
        { id: `o${Date.now()}`, name: v, address: "Адрес уточняется", stages: 4, done: 0 },
      ]);
    if (tab === "workTypes")
      setWorkTypes((p) => [...p, { id: `w${Date.now()}`, name: v, unit: "м²", price: 0 }]);
    setValue("");
    toast.success("Добавлено");
  };

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Профиль" />

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <InitialsAvatar name={currentUser.full_name} className="size-14 text-base" />
        <div className="min-w-0">
          <p className="text-lg font-bold">{currentUser.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {roleLabels[currentUser.role as Role]} · {currentUser.phone}
          </p>
        </div>
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Оформление</h2>
        <button
          onClick={toggleTheme}
          className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm"
        >
          Тёмная тема
          <span
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              theme === "dark" ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                theme === "dark" ? "left-[22px]" : "left-0.5",
              )}
            />
          </span>
        </button>
      </section>

      {isAdmin && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Справочники</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["employees", "Сотрудники"],
                ["objects", "Объекты"],
                ["workTypes", "Виды работ"],
                ["users", "Пользователи"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold",
                  tab === key ? "bg-primary text-primary-foreground" : "bg-surface",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab !== "users" && (
            <div className="mt-3 flex gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Новое значение..."
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <button
                onClick={add}
                className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Добавить
              </button>
            </div>
          )}

          <ul className="mt-3 divide-y divide-border rounded-xl bg-surface">
            {tab === "employees" &&
              employees.map((e) => (
                <li key={e} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  {e}
                  <button
                    onClick={() => setEmployees((p) => p.filter((x) => x !== e))}
                    className="text-xs font-semibold text-status-rejected"
                  >
                    Удалить
                  </button>
                </li>
              ))}
            {tab === "objects" &&
              objects.map((o) => (
                <li key={o.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{o.address}</span>
                </li>
              ))}
            {tab === "workTypes" &&
              workTypes.map((w) => (
                <li key={w.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{w.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {w.unit} · {w.price} ₽
                  </span>
                </li>
              ))}
            {tab === "users" &&
              users.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>
                    {u.full_name}
                    <span className="block text-xs text-muted-foreground">{u.phone}</span>
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {roleLabels[u.role as Role]}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <Link
        to="/login"
        className="mt-4 block rounded-2xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold text-status-rejected"
      >
        Выйти из аккаунта
      </Link>
    </AppShell>
  );
}