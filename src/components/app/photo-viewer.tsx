import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const WHEEL_ZOOM_FACTOR = 1.15;
const BUTTON_ZOOM_FACTOR = 1.4;

type Transform = { scale: number; x: number; y: number };

export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchDist = useRef<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const didPan = useRef(false);
  const isInteracting = useRef(false);
  // true всякий раз, когда во время жеста был реальный сдвиг пальца (пан/свайп) —
  // используется, чтобы фантомный "click" в конце свайпа/пана не закрывал просмотрщик,
  // даже если палец в момент отпускания оказался за пределами <img> (леттербокс).
  const wasGesture = useRef(false);

  const count = photos.length;
  const canNavigate = count > 1;
  const zoomed = transform.scale > 1.01;

  const resetTransform = () => setTransform({ scale: 1, x: 0, y: 0 });

  const goPrev = () => {
    resetTransform();
    setIndex((i) => (i - 1 + count) % count);
  };
  const goNext = () => {
    resetTransform();
    setIndex((i) => (i + 1) % count);
  };
  const goTo = (i: number) => {
    resetTransform();
    setIndex(i);
  };

  const getCenter = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  };

  const zoomAt = (clientX: number, clientY: number, newScaleRaw: number) => {
    const { cx, cy } = getCenter();
    const mx = clientX - cx;
    const my = clientY - cy;
    setTransform((prev) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScaleRaw));
      if (newScale <= MIN_SCALE) return { scale: 1, x: 0, y: 0 };
      const x = mx - (newScale / prev.scale) * (mx - prev.x);
      const y = my - (newScale / prev.scale) * (my - prev.y);
      return { scale: newScale, x, y };
    });
  };

  const zoomByButton = (factor: number) => {
    const { cx, cy } = getCenter();
    zoomAt(cx, cy, transform.scale * factor);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canNavigate && !zoomed) goPrev();
      else if (e.key === "ArrowRight" && canNavigate && !zoomed) goNext();
      else if (e.key === "+" || e.key === "=") zoomByButton(BUTTON_ZOOM_FACTOR);
      else if (e.key === "-") zoomByButton(1 / BUTTON_ZOOM_FACTOR);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canNavigate, onClose, zoomed, transform.scale]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleTapOrDoubleTap = (x: number, y: number, pointerType: string) => {
    if (pointerType !== "touch") return;
    const now = Date.now();
    if (
      lastTap.current &&
      now - lastTap.current.time < 300 &&
      Math.hypot(x - lastTap.current.x, y - lastTap.current.y) < 30
    ) {
      zoomAt(x, y, transform.scale > 1 ? 1 : DOUBLE_TAP_SCALE);
      lastTap.current = null;
    } else {
      lastTap.current = { time: now, x, y };
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    zoomAt(e.clientX, e.clientY, transform.scale > 1 ? 1 : DOUBLE_TAP_SCALE);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
    zoomAt(e.clientX, e.clientY, transform.scale * factor);
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Если только что был реальный свайп/пан — это фантомный click, который браузер
    // может сгенерировать в точке, куда уехал палец (например, в леттербокс за
    // пределами <img>). Гасим его в любом случае, чтобы просмотрщик не закрывался.
    if (wasGesture.current) {
      e.stopPropagation();
      wasGesture.current = false;
      return;
    }
    // Клик по самому фото (или другому дочернему элементу) — не закрываем.
    // Клик по пустому полю вокруг фото (леттербокс) — даём всплыть и закрыться.
    if (e.target !== e.currentTarget) {
      e.stopPropagation();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    didPan.current = false;
    wasGesture.current = false;
    isInteracting.current = true;

    if (pointers.current.size === 1) {
      if (transform.scale > 1) {
        panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
      } else if (canNavigate) {
        swipeStart.current = { x: e.clientX, y: e.clientY };
      }
    } else if (pointers.current.size === 2) {
      panStart.current = null;
      swipeStart.current = null;
      const pts = Array.from(pointers.current.values());
      const [p1, p2] = pts;
      if (p1 && p2) pinchDist.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const [p1, p2] = pts;
      if (!p1 || !p2) return;
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      if (pinchDist.current) {
        const ratio = dist / pinchDist.current;
        pinchDist.current = dist;
        didPan.current = true;
        zoomAt(midX, midY, transform.scale * ratio);
      }
      return;
    }

    if (panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
      const start = panStart.current;
      setTransform((prev) => ({ ...prev, x: start.tx + dx, y: start.ty + dy }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasSwipe = swipeStart.current;
    pointers.current.delete(e.pointerId);

    if (pointers.current.size < 2) pinchDist.current = null;

    if (pointers.current.size === 0) {
      isInteracting.current = false;
      if (didPan.current) wasGesture.current = true;
      if (wasSwipe && !didPan.current) {
        const dx = e.clientX - wasSwipe.x;
        const dy = e.clientY - wasSwipe.y;
        if (Math.hypot(dx, dy) > 10) wasGesture.current = true;
        if (Math.abs(dx) > 50) {
          if (dx > 0) goPrev();
          else goNext();
        } else {
          handleTapOrDoubleTap(e.clientX, e.clientY, e.pointerType);
        }
      } else if (!wasSwipe && !didPan.current) {
        handleTapOrDoubleTap(e.clientX, e.clientY, e.pointerType);
      }
      panStart.current = null;
      swipeStart.current = null;
      didPan.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {canNavigate ? (
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/80">
            {index + 1} / {count}
          </span>
        ) : (
          <span />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Закрыть"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-2 md:px-16"
        onClick={handleContainerClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {canNavigate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Предыдущее фото"
            className="absolute left-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:left-4 md:size-12"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}

        <img
          src={photos[index]}
          alt="Фото к записи, полный размер"
          draggable={false}
          className={cn(
            "max-h-[75vh] max-w-full rounded-xl object-contain select-none md:max-h-[82vh] md:max-w-[90vw] lg:max-w-[85vw]",
            zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
          )}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: isInteracting.current ? "none" : "transform 0.15s ease-out",
          }}
        />

        {canNavigate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Следующее фото"
            className="absolute right-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:right-4 md:size-12"
          >
            <ChevronRight className="size-6" />
          </button>
        )}

        <div
          className="absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-full bg-white/10 p-1 md:right-4 md:bottom-4"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => zoomByButton(1 / BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale <= MIN_SCALE}
            aria-label="Уменьшить"
            className="flex size-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30 md:size-9"
          >
            <ZoomOut className="size-4 md:size-5" />
          </button>
          <button
            onClick={() => zoomByButton(BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale >= MAX_SCALE}
            aria-label="Увеличить"
            className="flex size-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30 md:size-9"
          >
            <ZoomIn className="size-4 md:size-5" />
          </button>
        </div>
      </div>

      {canNavigate && (
        <div
          className="flex justify-center gap-2 overflow-x-auto px-4 pb-4 pt-1 md:pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={p + i}
              onClick={() => goTo(i)}
              className={cn(
                "size-12 shrink-0 overflow-hidden rounded-lg border-2 transition md:size-14",
                i === index ? "border-white" : "border-transparent opacity-50 hover:opacity-80",
              )}
            >
              <img src={p} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
