import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { roleLabels, type Role } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/profile/")({
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

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left text-sm",
        disabled && "opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function ProfilePage() {
  const {
    role,
    currentUser,
    theme,
    themeMode,
    setThemeMode,
    notifications,
    setNotifications,
    logout,
  } = useApp();
  const isAdmin = role === "admin";

  const setNotif = <K extends keyof typeof notifications>(key: K, v: (typeof notifications)[K]) =>
    setNotifications((p) => ({ ...p, [key]: v }));

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Профиль" />

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <InitialsAvatar name={currentUser.full_name} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{currentUser.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {roleLabels[currentUser.role as Role]} · {currentUser.login}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
        >
          Выйти
        </button>
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Оформление</h2>
        <p className="label-caps mt-3">Тема</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["light", "Светлая"],
              ["dark", "Тёмная"],
              ["system", "Как в системе"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setThemeMode(key)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-sm font-semibold",
                themeMode === key ? "bg-primary text-primary-foreground" : "bg-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {themeMode === "system"
            ? `Автоматически по настройке телефона — сейчас ${theme === "dark" ? "тёмная" : "светлая"}`
            : "Ручной режим: тема не меняется вслед за системой"}
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Уведомления в Telegram</h2>
        <div className="mt-3 space-y-2">
          <Switch
            checked={notifications.telegramEnabled}
            onChange={(v) => setNotif("telegramEnabled", v)}
            label="Присылать в Telegram"
            hint="Бот отправляет сообщения в личный чат"
          />
          <label className="block">
            <span className="label-caps">Telegram-аккаунт</span>
            <input
              value={notifications.telegramUsername}
              onChange={(e) => setNotif("telegramUsername", e.target.value)}
              disabled={!notifications.telegramEnabled}
              placeholder="@username"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm disabled:opacity-50"
            />
          </label>
          <Switch
            disabled={!notifications.telegramEnabled}
            checked={notifications.telegramNewRecords}
            onChange={(v) => setNotif("telegramNewRecords", v)}
            label="Новые записи по объектам"
          />
          <Switch
            disabled={!notifications.telegramEnabled}
            checked={notifications.telegramRequests}
            onChange={(v) => setNotif("telegramRequests", v)}
            label="Заявки на новые виды работ"
          />
          <Switch
            disabled={!notifications.telegramEnabled}
            checked={notifications.telegramDailyDigest}
            onChange={(v) => setNotif("telegramDailyDigest", v)}
            label="Ежедневная сводка за день"
            hint="Одно сообщение в 20:00"
          />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Уведомления в приложении</h2>
        <div className="mt-3 space-y-2">
          <Switch
            checked={notifications.inAppEnabled}
            onChange={(v) => setNotif("inAppEnabled", v)}
            label="Показывать уведомления"
            hint="Значок и всплывающие сообщения внутри приложения"
          />
          <Switch
            disabled={!notifications.inAppEnabled}
            checked={notifications.inAppNewRecords}
            onChange={(v) => setNotif("inAppNewRecords", v)}
            label="Новые записи по объектам"
          />
          <Switch
            disabled={!notifications.inAppEnabled}
            checked={notifications.inAppRequests}
            onChange={(v) => setNotif("inAppRequests", v)}
            label="Заявки и их одобрение"
          />
          <Switch
            disabled={!notifications.inAppEnabled}
            checked={notifications.inAppMessages}
            onChange={(v) => setNotif("inAppMessages", v)}
            label="Сообщения в переписке"
          />
          <Switch
            disabled={!notifications.inAppEnabled}
            checked={notifications.inAppSound}
            onChange={(v) => setNotif("inAppSound", v)}
            label="Звук уведомления"
          />
        </div>
      </section>

      {isAdmin && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Управление</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Справочники приложения: добавление, редактирование и пакетная загрузка.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["work-types", "Виды работ — справочник"],
                ["employees", "Сотрудники (исполнители)"],
                ["objects", "Объекты"],
                ["units", "Единицы измерения"],
                ["users", "Пользователи"],
              ] as [string, string][]
            ).map(([key, label]) => (
              <Link
                key={key}
                to="/profile/manage/$section"
                params={{ section: key }}
                className="rounded-xl bg-surface px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted"
              >
                {label}
              </Link>
            ))}
          </div>
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