import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Свайп вниз в самом верху страницы на телефоне обновляет данные приложения —
 * как pull-to-refresh в нативных приложениях. Активен только на мобильных экранах
 * и только когда страница уже прокручена в самый верх (иначе это обычный скролл).
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    const setPullValue = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    // На мобильном страница скроллится не document/window, а внутренний
    // контейнер #app-scroll-container (см. AppShell) — это нужно, чтобы
    // обойти известный баг Safari на iOS, из-за которого фиксированное
    // нижнее меню "плавает"/подпрыгивает при скролле самого document.
    // Поэтому здесь проверяем scrollTop этого контейнера, а не window.scrollY.
    const getScrollTop = () =>
      document.getElementById("app-scroll-container")?.scrollTop ?? window.scrollY;

    // Полноэкранные диалоги (выбор вида работ, Radix Dialog и т.п.) рисуются
    // поверх страницы, но лежат в том же DOM-дереве — без этой проверки
    // свайп внутри их собственного списка воспринимается глобальным
    // обработчиком как pull-to-refresh фоновой страницы, потому что
    // window.scrollY фона остаётся равным 0.
    const isInsideOverlay = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('[role="dialog"], [data-pull-refresh-ignore]');
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (getScrollTop() > 0) return;
      if (e.touches.length !== 1) return;
      if (isInsideOverlay(e.target)) return;
      startYRef.current = e.touches[0]!.clientY;
      trackingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      const dy = e.touches[0]!.clientY - startYRef.current;
      if (dy <= 0 || getScrollTop() > 0) {
        trackingRef.current = false;
        setPullValue(0);
        return;
      }
      // сопротивление при вытягивании, как в нативных списках
      setPullValue(Math.min(MAX_PULL, dy * 0.5));
      if (dy > 10 && e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (pullRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullValue(PULL_THRESHOLD);
        void onRefreshRef.current().finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullValue(0);
        });
      } else {
        setPullValue(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const progress = Math.min(1, pull / PULL_THRESHOLD);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center md:hidden"
        style={{ height: pull, opacity: pull > 4 ? 1 : 0 }}
      >
        <span className="mt-3 flex size-8 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <RefreshCw
            className={cn("size-4 text-primary", refreshing && "animate-spin")}
            style={refreshing ? undefined : { transform: `rotate(${progress * 220}deg)` }}
          />
        </span>
      </div>
      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: pull === 0 || refreshing ? "transform 200ms ease" : "none",
        }}
      >
        {children}
      </div>
    </>
  );
}
