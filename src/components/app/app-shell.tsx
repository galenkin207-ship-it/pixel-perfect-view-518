import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  Inbox,
  ListChecks,
  MessageSquare,
  Plus,
  Ruler,
  Settings,
  User,
  Users,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { roleLabels, type Role } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { InitialsAvatar } from "./bits";
import { PullToRefresh } from "./pull-to-refresh";

type NavItem = { to: string; label: string; icon: typeof Building2; badge?: number };

const tabs: NavItem[] = [
  { to: "/", label: "Объекты", icon: Building2 },
  { to: "/reports", label: "Отчёты", icon: FileBarChart },
  { to: "/messages", label: "Переписка", icon: MessageSquare },
  { to: "/profile", label: "Профиль", icon: User },
];

const mobileTabs = (role: Role): NavItem[] => [
  { to: "/", label: "Объекты", icon: Building2 },
  { to: "/reports/all", label: "Все записи", icon: ListChecks },
  { to: "/reports", label: "Отчёты", icon: FileBarChart },
  role === "admin"
    ? { to: "/messages", label: "Заявки", icon: Inbox }
    : { to: "/messages", label: "Переписка", icon: MessageSquare },
  role === "user"
    ? { to: "/work-types", label: "Все виды работ", icon: ClipboardList }
    : { to: "/profile", label: "Профиль", icon: User },
];

export function AppShell({
  children,
  fab,
}: {
  children: ReactNode;
  fab?: { to: string; label?: string };
}) {
  const { role, currentUser, notificationsCount, requests, refreshData } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminLike = role === "admin" || role === "curator";
  const pending = requests.filter((r) => r.status === "pending").length;

  const swipeOrder = useMemo(() => mobileTabs(role).map((t) => t.to), [role]);
  useSwipeNav(swipeOrder, pathname);

  const home: NavItem[] = [
    { to: "/", label: "Объекты", icon: Building2 },
    { to: "/reports/all", label: "Все записи", icon: ListChecks },
    { to: "/messages", label: "Заявки на согласование", icon: Inbox, badge: pending },
  ];
  const manage: NavItem[] = [
    { to: "/profile/manage/work-types", label: "Виды работ", icon: ClipboardList },
    { to: "/profile/manage/objects", label: "Объекты", icon: Building2 },
    { to: "/profile/manage/employees", label: "Сотрудники", icon: Users },
    { to: "/profile/manage/units", label: "Единицы измерения", icon: Ruler },
  ];
  const admin: NavItem[] = [
    { to: "/profile/manage/users", label: "Пользователи", icon: Users },
    { to: "/profile", label: "Настройки", icon: Settings },
  ];

  const isActive = (to: string) =>
    to === "/"
      ? pathname === "/"
      : to === "/reports"
        ? pathname === "/reports"
        : pathname.startsWith(to);

  return (
    <div className="min-h-dvh bg-panel text-foreground md:h-screen">
      <div className="flex min-h-dvh w-full overflow-hidden bg-panel md:h-full md:min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar p-4 md:flex lg:w-[250px] xl:w-[280px]">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              У
            </span>
            <span className="text-base font-bold">
              Учёт<span className="text-primary">.работ</span>
            </span>
          </Link>

          <Link
            to="/notifications"
            className={cn(
              "mb-5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted",
              isActive("/notifications") && "bg-accent font-semibold text-accent-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Bell className="size-4 text-muted-foreground" />
              Уведомления
            </span>
            {notificationsCount > 0 && (
              <span className="text-xs font-semibold text-primary">{notificationsCount}</span>
            )}
          </Link>

          {isAdminLike && <NavGroup title="Главная" items={home} isActive={isActive} />}
          <NavGroup title="Аналитика" items={tabs.slice(1, 2)} isActive={isActive} />
          {isAdminLike && <NavGroup title="Управление" items={manage} isActive={isActive} />}
          <NavGroup
            title={isAdminLike ? "Администрирование" : "Разделы"}
            items={
              isAdminLike
                ? admin
                : [
                    tabs[0]!,
                    { to: "/reports/all", label: "Все записи", icon: ListChecks },
                    { to: "/work-types", label: "Все виды работ", icon: ClipboardList },
                    tabs[2]!,
                    tabs[3]!,
                  ]
            }
            isActive={isActive}
          />

          <div className="mt-auto space-y-3 pt-4">
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-muted"
            >
              <InitialsAvatar name={currentUser.full_name} className="size-9 text-xs" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {currentUser.full_name}
                </span>
                <span className="block text-xs text-muted-foreground">{roleLabels[role]}</span>
              </span>
            </Link>
          </div>
        </aside>

        {/* Content */}
        <main className="relative min-w-0 flex-1 bg-background pb-28 md:overflow-y-auto md:pb-0">
          <PullToRefresh onRefresh={refreshData}>
            {/* Mobile top bar */}
            <div className="flex items-center justify-between gap-2 px-4 pt-4 md:hidden">
              <Link to="/" className="flex items-center gap-2 text-sm font-bold">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
                  У
                </span>
                Учёт работ
              </Link>
              <div className="flex items-center gap-2">
                {role === "user" && (
                  <Link
                    to="/profile"
                    aria-label="Профиль"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border border-border bg-surface",
                      isActive("/profile") && "border-primary text-primary",
                    )}
                  >
                    <Settings className="size-4" />
                  </Link>
                )}
                <Link
                  to="/notifications"
                  aria-label="Уведомления"
                  className="relative flex size-8 items-center justify-center rounded-full border border-border bg-surface"
                >
                  <Bell className="size-4" />
                  {notificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {notificationsCount}
                    </span>
                  )}
                </Link>
              </div>
            </div>

            <div className="w-full px-4 py-5 md:px-6 md:py-6 xl:px-10 xl:py-8">{children}</div>
          </PullToRefresh>

          {fab && (
            <Link
              to={fab.to}
              aria-label={fab.label ?? "Новая запись"}
              className="fixed right-5 bottom-28 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:right-10 md:bottom-10"
            >
              <Plus className="size-6" />
            </Link>
          )}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-panel pt-3 pb-[calc(1.1rem+env(safe-area-inset-bottom))] [transform:translateZ(0)] md:hidden">
        {mobileTabs(role).map((t) => {
          const active = isActive(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center gap-1.5 text-center text-[9px] leading-tight font-semibold tracking-[0.04em] uppercase",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <t.icon className="size-[22px]" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavGroup({
  title,
  items,
  isActive,
}: {
  title: string;
  items: NavItem[];
  isActive: (to: string) => boolean;
}) {
  return (
    <div className="mb-5">
      <span className="label-caps px-3">{title}</span>
      <ul className="mt-2 space-y-1">
        {items.map((item) => {
          const active = isActive(item.to);
          return (
            <li key={item.to + item.label}>
              <Link
                to={item.to}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-3.5 rounded-full border-2",
                      active ? "border-primary bg-primary" : "border-muted-foreground/40",
                    )}
                  />
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="text-xs font-semibold text-primary">{item.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const shellIcons = { ClipboardList };
