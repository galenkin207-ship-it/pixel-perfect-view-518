import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 88;
const MAX_DRAG = 140;

/**
 * Оборачивает строку списка (рендерится как <li>, чтобы корректно вкладываться в <ul>)
 * и позволяет "акцентированным" свайпом влево вызвать onSwipe (например, добавить вид
 * работы в собираемую запись). Пока палец/курсор не сдвинулся заметно по горизонтали —
 * жест не перехватывается, вертикальный скролл страницы продолжает работать как обычно.
 */
export function SwipeToAddRow({
  onSwipe,
  disabled,
  children,
}: {
  onSwipe: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<"horizontal" | "vertical" | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const reset = () => {
    setDragX(0);
    setDragging(false);
    startRef.current = null;
    axisRef.current = null;
    pointerIdRef.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    axisRef.current = null;
    pointerIdRef.current = e.pointerId;
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (!axisRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (axisRef.current === "horizontal") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
    if (axisRef.current !== "horizontal") return;

    e.preventDefault();
    setDragX(Math.min(0, Math.max(-MAX_DRAG, dx)));
  };

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const triggered = axisRef.current === "horizontal" && dragX <= -SWIPE_THRESHOLD;
    reset();
    if (triggered) onSwipe();
  };

  const progress = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);
  const armed = dragX <= -SWIPE_THRESHOLD;

  return (
    <li className="relative overflow-hidden">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-end gap-2 px-5 text-primary-foreground",
          armed ? "bg-primary" : "bg-primary/60",
        )}
        style={{ opacity: progress }}
      >
        <Plus className="size-5" />
        <span className="text-sm font-semibold whitespace-nowrap">
          {armed ? "Добавить" : "В новую запись"}
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 200ms ease",
        }}
        className="relative touch-pan-y bg-card transition-colors select-none [@media(hover:hover)]:hover:bg-muted/60"
      >
        {children}
      </div>
    </li>
  );
}
