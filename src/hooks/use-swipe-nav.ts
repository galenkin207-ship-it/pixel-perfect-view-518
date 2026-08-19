import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Mobile page swipe: horizontal swipe (right = back / previous page,
 * left = next page) moves through the given ordered list of routes.
 */
export function useSwipeNav(order: string[], currentPath: string) {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const blocked = (target: EventTarget | null) => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (el.scrollWidth - el.clientWidth > 8) return true;
        if (el.dataset["noSwipeNav"] !== undefined) return true;
        el = el.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (blocked(e.target)) return;
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;

      const index = order.findIndex((p) =>
        p === "/" ? currentPath === "/" : currentPath.startsWith(p),
      );
      if (index === -1) {
        // Not a top-level page: swipe right acts as "back".
        if (dx > 0) window.history.back();
        return;
      }
      const next = dx < 0 ? index + 1 : index - 1;
      const to = order[next];
      if (to) void navigate({ to });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [order, currentPath, navigate]);
}
