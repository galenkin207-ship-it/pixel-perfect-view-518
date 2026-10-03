import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  HardHat,
  Inbox,
  ListChecks,
  MessageSquare,
  Plus,
  Ruler,
  Settings,
  User,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  isDesktopNow,
  readNavSearch,
  readScroll,
  readSectionSub,
  writeNavSearch,
  writeScroll,
  writeSectionSub,
} from "@/lib/page-state";
import { cn } from "@/lib/utils";
import { roleLabels, type Role } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { useViewportHeight } from "@/hooks/use-viewport-height";
import { InitialsAvatar } from "./bits";
import { PullToRefresh } from "./pull-to-refresh";

type NavItem = { to: string; label: string; icon: typeof Building2; badge?: number };

// Разделы, у которых фильтры живут в URL: ссылка левого меню ведёт на их
// последний URL (на компьютере), а не на «чистый» раздел. /messages сюда не
// входит — его параметры открывают конкретную заявку (модалку).
const NAV_SEARCH_PATHS = new Set(["/reports", "/reports/all", "/reports/detail"]);
// Пункт меню → его подстраницы. Из другого раздела пункт ведёт на последнюю
// открытую подстраницу (с её URL), изнутри раздела — на корень.
const NAV_SECTIONS: Record<string, string[]> = {
  "/reports": ["/reports", "/reports/detail"],
};
// Прокрутку не запоминаем у форм и экранов входа.
const noScrollMemory = (path: string) =>
  path.startsWith("/records/") || path === "/login" || path === "/reset-password";

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
  role === "user" || role === "admin"
    ? { to: "/work-types", label: "Все виды работ", icon: ClipboardList }
    : { to: "/profile", label: "Профиль", icon: User },
];

export function AppShell({
  children,
  fab,
}: {
  children: ReactNode;
  fab?: { to: string; label?: string; search?: Record<string, string> };
}) {
  const { role, currentUser, notificationsCount, requests, refreshData, readNotificationIds } =
    useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locationSearch = useRouterState({ select: (s) => s.location.search });
  const [desktop] = useState(isDesktopNow);
  const mainRef = useRef<HTMLElement>(null);
  usePageMemory(desktop, pathname, locationSearch as Record<string, unknown>, mainRef);
  const isAdminLike = role === "admin" || role === "curator";
  const pending = requests.filter((r) => r.status === "pending").length;
  // Мастер: выполненные заявки (с позицией справочника), которые он ещё не
  // открывал — то же уведомление «-approved», что и в разделе «Уведомления»
  // (прочитанным помечается при открытии раздела заявок). Сервер отдаёт
  // мастеру только его заявки.
  const unreadDone =
    role === "user"
      ? requests.filter(
          (r) =>
            r.status === "approved" && r.work_type && !readNotificationIds.has(`${r.id}-approved`),
        ).length
      : 0;

  const swipeOrder = useMemo(() => mobileTabs(role).map((t) => t.to), [role]);
  useSwipeNav(swipeOrder, pathname);

  // Пока на мобильном открыта экранная клавиатура (в фокусе текстовое
  // поле), прячем нижнее меню и FAB — иначе на iOS/Android они "уезжают"
  // вместе со скроллом вместо того, чтобы оставаться на месте.
  const isMobile = useIsMobile();
  const keyboardOpen = useKeyboardOpen();
  const hideMobileChrome = isMobile && keyboardOpen;
  useViewportHeight();

  const home: NavItem[] = [
    { to: "/", label: "Объекты", icon: Building2 },
    { to: "/reports/all", label: "Все записи", icon: ListChecks },
    { to: "/messages", label: "Заявки на согласование", icon: Inbox, badge: pending },
  ];
  const manage: NavItem[] = [
    { to: "/brigades", label: "Бригады", icon: HardHat },
    { to: "/work-types", label: "Виды работ", icon: ClipboardList },
    { to: "/profile/manage/objects", label: "Объекты", icon: Building2 },
    { to: "/profile/manage/employees", label: "Сотрудники", icon: Users },
    { to: "/profile/manage/units", label: "Единицы измерения", icon: Ruler },
  ];
  const admin: NavItem[] = [
    { to: "/profile/manage/users", label: "Пользователи", icon: Users },
    { to: "/profile", label: "Настройки", icon: Settings },
  ];

  // Ссылки и подсветка левого меню (только компьютер, см. NAV_SECTIONS).
  const sidebarLink = (to: string): { to: string; search?: Record<string, unknown> } => {
    if (!desktop) return { to };
    const sub = NAV_SECTIONS[to];
    let target = to;
    if (sub && !sub.includes(pathname)) {
      const last = readSectionSub(to);
      if (last && sub.includes(last)) target = last;
    }
    const search = NAV_SEARCH_PATHS.has(target) ? readNavSearch(target) : undefined;
    return search ? { to: target, search } : { to: target };
  };
  const sidebarActive = (to: string) =>
    desktop && NAV_SECTIONS[to] ? NAV_SECTIONS[to].includes(pathname) : isActive(to);

  const isActive = (to: string) =>
    to === "/"
      ? pathname === "/"
      : to === "/reports"
        ? pathname === "/reports"
        : pathname.startsWith(to);

  return (
    <div className="min-h-[var(--app-vh,100dvh)] bg-panel text-foreground desktop:h-screen">
      <div className="flex h-[var(--app-vh,100dvh)] w-full overflow-hidden bg-panel desktop:h-full desktop:min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar p-4 pt-[calc(1rem+env(safe-area-inset-top))] desktop:flex lg:w-[250px] xl:w-[280px]">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <img
              src="/icon-192.png"
              alt="Учёт работ"
              className="size-8 shrink-0 rounded-lg object-cover"
            />
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
              <Bell
                className={cn(
                  "size-4 text-muted-foreground",
                  isActive("/notifications") && "text-primary",
                )}
              />
              Уведомления
            </span>
            {notificationsCount > 0 && (
              <span className="text-xs font-semibold text-primary">{notificationsCount}</span>
            )}
          </Link>

          <NavGroup
            title="Главная"
            items={isAdminLike ? home : [tabs[0]!]}
            isActive={sidebarActive}
            linkFor={sidebarLink}
          />
          <NavGroup
            title="Аналитика"
            items={tabs.slice(1, 2)}
            isActive={sidebarActive}
            linkFor={sidebarLink}
          />
          {isAdminLike && (
            <NavGroup
              title="Управление"
              items={manage}
              isActive={sidebarActive}
              linkFor={sidebarLink}
            />
          )}
          <NavGroup
            title={isAdminLike ? "Администрирование" : "Разделы"}
            items={
              isAdminLike
                ? admin
                : [
                    { to: "/reports/all", label: "Все записи", icon: ListChecks },
                    { to: "/work-types", label: "Все виды работ", icon: ClipboardList },
                    { to: "/brigades", label: "Бригады", icon: HardHat },
                    { ...tabs[2]!, ...(unreadDone > 0 ? { badge: unreadDone } : {}) },
                    tabs[3]!,
                  ]
            }
            isActive={sidebarActive}
            linkFor={sidebarLink}
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
        <main
          ref={mainRef}
          id="app-scroll-container"
          className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background pb-28 desktop:pb-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <PullToRefresh onRefresh={refreshData}>
            {/* Mobile top bar. Отступ сверху = safe-area-inset-top, чтобы
                шапка не оказалась под статус-баром/Dynamic Island на iPhone. */}
            <div className="flex items-center justify-between gap-2 px-2 pt-[calc(0.25rem+env(safe-area-inset-top))] desktop:hidden">
              <Link to="/" className="flex items-center gap-2 text-sm font-bold">
                <img
                  src="/icon-192.png"
                  alt="Учёт работ"
                  className="size-6 shrink-0 rounded-md object-cover"
                />
                Учёт работ
              </Link>
              <div className="flex items-center gap-2">
                {(role === "user" || role === "admin") && (
                  <Link
                    to="/profile"
                    aria-label="Профиль"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border border-border bg-surface transition-colors duration-150 ease-out",
                      isActive("/profile") && "border-primary text-primary",
                    )}
                  >
                    <Settings className="size-4" />
                  </Link>
                )}
                <Link
                  to="/notifications"
                  aria-label="Уведомления"
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full border border-border bg-surface transition-colors duration-150 ease-out",
                    isActive("/notifications") && "border-primary text-primary",
                  )}
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

            {/* Лёгкий fade только у контента страницы — сайдбар, мобильная шапка,
                нижняя навигация и FAB (снаружи) в анимации не участвуют и не
                мигают при переходах. AppShell и так пересоздаётся заново на каждый
                роут (persistent layout в проекте нет), поэтому motion.div ниже сам
                монтируется свежим на каждый переход — explicit key не нужен. */}
            <motion.div
              className="w-full px-2 py-5 desktop:px-6 desktop:py-6 xl:px-10 xl:py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </PullToRefresh>

          {fab && (
            <Link
              to={fab.to}
              {...(fab.search ? { search: fab.search } : {})}
              aria-label={fab.label ?? "Новая запись"}
              className={cn(
                "fixed right-5 bottom-28 z-30 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_20px_-6px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_16px_28px_-6px_rgba(15,23,42,0.55)] active:translate-y-0 active:scale-100 desktop:right-10 desktop:bottom-10",
                hideMobileChrome && "hidden",
              )}
            >
              <Plus className="size-7" />
            </Link>
          )}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className={cn(
          // pb здесь — это отступ ПОВЕРХ реального safe-area-inset-bottom (а
          // не вместо него): раньше, без viewport-fit=cover в viewport meta,
          // env(safe-area-inset-bottom) не применялся браузером и фактически
          // был равен 0, поэтому базовое значение 1.1rem подбиралось "на
          // глаз" как единственный отступ. После включения viewport-fit=cover
          // инсет стал считаться по-настоящему (реальные ~34px на iPhone с
          // Home Indicator) и складывался поверх старого 1.1rem — отсюда
          // лишнее пустое место под иконками. 0.35rem — это уже просто
          // небольшой воздух над самим safe-area, а не его замена.
          // max(), а не +: берём БОЛЬШЕЕ из двух значений, а не сумму — на
          // iPhone с Home Indicator реальный safe-area-inset-bottom (~34px)
          // сам по себе больше 0.25rem, поэтому используется он один, без
          // добавления сверху (в этом и была причина лишнего пустого места
          // после включения viewport-fit=cover). На Android/iPhone без
          // индикатора safe-area-inset-bottom равен 0, и в дело вступает
          // минимальный отступ 0.25rem, чтобы иконки не липли к краю экрана.
          // position: fixed при этом не трогаем — статичность меню держится
          // за счёт interactive-widget в viewport meta, а не за счёт этих
          // отступов.
          "fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-panel pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] [transform:translateZ(0)] desktop:hidden",
          hideMobileChrome && "hidden",
        )}
      >
        {mobileTabs(role).map((t) => {
          const active = isActive(t.to);
          // Синяя точка на вкладке «Заявки» у админов, пока есть хотя бы
          // одна необработанная (pending) заявка — независимо от того,
          // на какой странице сейчас находится пользователь.
          // У мастера — точка, пока есть выполненные заявки, которые он ещё не
          // открывал.
          const showPendingDot =
            t.to === "/messages" &&
            ((role === "admin" && pending > 0) || (role === "user" && unreadDone > 0));
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center gap-1.5 text-center text-[9px] leading-tight font-semibold tracking-[0.04em] uppercase transition-colors duration-150 ease-out",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <t.icon className="size-[22px]" />
                {showPendingDot && (
                  <span
                    aria-label={
                      role === "user" ? "Есть выполненные заявки" : "Есть необработанные заявки"
                    }
                    className="absolute -top-0.5 -right-0.5 block size-2 rounded-full bg-primary ring-2 ring-panel"
                  />
                )}
              </span>
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
  linkFor,
}: {
  title: string;
  items: NavItem[];
  isActive: (to: string) => boolean;
  linkFor: (to: string) => { to: string; search?: Record<string, unknown> };
}) {
  return (
    <div className="mb-5">
      <span className="label-caps px-3">{title}</span>
      <ul className="mt-2 space-y-1">
        {items.map((item) => {
          const active = isActive(item.to);
          const link = linkFor(item.to);
          return (
            <li key={item.to + item.label}>
              <Link
                to={link.to}
                {...(link.search ? { search: link.search as never } : {})}
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

/**
 * Компьютер: запоминает прокрутку #app-scroll-container и URL-фильтры раздела,
 * при возврате в раздел возвращает прокрутку (см. lib/page-state.ts).
 */
function usePageMemory(
  desktop: boolean,
  pathname: string,
  search: Record<string, unknown>,
  mainRef: React.RefObject<HTMLElement | null>,
) {
  const restoringRef = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (desktop && NAV_SEARCH_PATHS.has(pathname)) writeNavSearch(pathname, search);
  }, [desktop, pathname, search]);
  useEffect(() => {
    if (!desktop) return;
    for (const [root, subs] of Object.entries(NAV_SECTIONS)) {
      if (subs.includes(pathname)) writeSectionSub(root, pathname);
    }
  }, [desktop, pathname]);

  // Восстановление: несколько кадров подряд держим сохранённую позицию —
  // пока дорисовывается содержимое и пока роутер делает свой scroll-to-top.
  // Любое действие пользователя (колесо, клик, клавиша) прерывает.
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!desktop || !el || noScrollMemory(pathname)) return;
    const target = readScroll(pathname);
    if (!target) return;
    restoringRef.current = true;
    let stopped = false;
    let raf = 0;
    const start = performance.now();
    const stop = () => {
      stopped = true;
    };
    const events = ["wheel", "pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => el.addEventListener(e, stop, { passive: true }));
    const finish = () => {
      restoringRef.current = false;
      events.forEach((e) => el.removeEventListener(e, stop));
    };
    const tick = () => {
      if (stopped) return finish();
      if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
      // ~1.2 с: часть страниц (объект) догружает данные с сервера.
      if (performance.now() - start < 1200) raf = requestAnimationFrame(tick);
      else finish();
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      finish();
    };
  }, [desktop, pathname, mainRef]);

  useEffect(() => {
    const el = mainRef.current;
    if (!desktop || !el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Путь и позицию фиксируем в момент прокрутки: к срабатыванию debounce
    // pathname может уже смениться (переход между разделами).
    let lastPath = pathRef.current;
    let lastTop = 0;
    const save = () => {
      timer = null;
      if (!noScrollMemory(lastPath)) writeScroll(lastPath, lastTop);
    };
    const onScroll = () => {
      if (restoringRef.current) return;
      lastPath = pathRef.current;
      lastTop = el.scrollTop;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }, [desktop, mainRef]);
}

export const shellIcons = { ClipboardList };
