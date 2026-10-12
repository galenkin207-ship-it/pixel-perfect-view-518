import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const WHEEL_ZOOM_FACTOR = 1.15;
const BUTTON_ZOOM_FACTOR = 1.4;

type Transform = { scale: number; x: number; y: number };

// Необязательная подпись к фото (например, у фото-отчётов: бейдж, автор,
// дата/время, комментарий).
export type PhotoCaption = {
  badge?: string;
  author?: string | null;
  meta?: string;
  comment?: string | null;
};

// Действия над текущим фото — меню «⋯» в подписи. Показывается только у фото
// с подписью и только если canModify(index) вернул true.
export type PhotoViewerActions = {
  canModify: (index: number) => boolean;
  onEdit: (index: number) => void;
  onDelete: (index: number) => Promise<void>;
};

export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
  captions,
  actions,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
  captions?: (PhotoCaption | null | undefined)[];
  actions?: PhotoViewerActions;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchDist = useRef<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const didPan = useRef(false);
  const isInteracting = useRef(false);
  // Тип последнего указателя (mouse/touch/pen) — click-событие само по себе
  // этого не знает, а нам нужно отличать мышь от тача в handleContainerClick.
  const lastPointerType = useRef<string>("mouse");
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

  // Стадии зума одиночным кликом мыши: 1x → 2x → MAX_SCALE → 1x → ...
  const nextClickZoomStage = (scale: number) => {
    if (scale <= MIN_SCALE + 0.01) return 2;
    if (scale < MAX_SCALE - 0.01) return MAX_SCALE;
    return MIN_SCALE;
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

  // Дополнительная страховка от системного жеста iOS "смахнуть от края экрана
  // назад": пока внутри просмотрщика идёт активное перетаскивание пальцем,
  // явно гасим touchmove (non-passive), как это уже сделано для
  // pull-to-refresh — это единственный способ реально повлиять на подобные
  // жесты на уровне WebKit, в отличие от preventDefault на pointer-событиях.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (isInteracting.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
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

    if (lastPointerType.current === "touch") {
      // Тач не трогаем — поведение оставлено ровно таким, каким было.
      if (e.target !== e.currentTarget) {
        e.stopPropagation();
      }
      return;
    }

    // Мышь/перо: handlePointerDown вызывает setPointerCapture на этом же
    // containerRef, из-за чего мышиный click ретаргетится браузером на сам
    // контейнер — e.target здесь оказывается контейнером, а не <img>, даже
    // если реально кликнули по фото. Поэтому target/currentTarget сравнивать
    // бесполезно (именно из-за этого клик по фото раньше всегда закрывал
    // просмотрщик) — определяем клик по фото геометрически, по границам <img>.
    const rect = imgRef.current?.getBoundingClientRect();
    const insideImage =
      !!rect &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    if (!insideImage) {
      // Клик по тёмному полю вокруг фото — даём всплыть и закрыться.
      return;
    }

    // Клик по фото — никогда не закрываем, вместо этого крутим зум по кругу.
    e.stopPropagation();
    zoomAt(e.clientX, e.clientY, nextClickZoomStage(transform.scale));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPointerType.current = e.pointerType;
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

  // Портал в document.body — иначе на iOS этот fixed-оверлей рендерится
  // внутри прокручиваемого #app-scroll-container и нижнее мобильное меню
  // может остаться поверх него (баг WebKit, на Android не проявляется).
  return createPortal(
    <div
      className="fixed inset-0 z-70 flex flex-col bg-black/90"
      onClick={onClose}
      data-no-swipe-nav
    >
      <div className="flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-6 md:py-4 md:pt-[calc(1rem+env(safe-area-inset-top))]">
        {canNavigate ? (
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/80">
            {index + 1} / {count}
          </span>
        ) : (
          <span />
        )}

        <div
          className="hidden items-center gap-1 rounded-full bg-white/10 p-1 md:flex"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => zoomByButton(1 / BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale <= MIN_SCALE}
            aria-label="Уменьшить"
            className="flex size-9 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ZoomOut className="size-5" />
          </button>
          <button
            onClick={() => zoomByButton(BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale >= MAX_SCALE}
            aria-label="Увеличить"
            className="flex size-9 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ZoomIn className="size-5" />
          </button>
        </div>

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
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-6 md:px-16"
        onClick={handleContainerClick}
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
          ref={imgRef}
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
          className="absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-full bg-white/10 p-1 md:hidden"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => zoomByButton(1 / BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale <= MIN_SCALE}
            aria-label="Уменьшить"
            className="flex size-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={() => zoomByButton(BUTTON_ZOOM_FACTOR)}
            disabled={transform.scale >= MAX_SCALE}
            aria-label="Увеличить"
            className="flex size-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      {captions?.[index] && (
        <CaptionBar
          key={index}
          caption={captions[index]!}
          {...(actions && actions.canModify(index)
            ? {
                onEdit: () => actions.onEdit(index),
                onDelete: () => actions.onDelete(index),
              }
            : {})}
        />
      )}

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
    </div>,
    document.body,
  );
}

function CaptionBar({
  caption,
  onEdit,
  onDelete,
}: {
  caption: PhotoCaption;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canModify = !!onEdit && !!onDelete;

  return (
    // Клики и жесты внутри подписи не должны закрывать просмотрщик и листать фото.
    <div
      className="relative mx-auto w-full max-w-3xl px-4 pb-2 text-white"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2 rounded-xl bg-white/10 px-3 py-2">
        <div className="min-w-0 flex-1 text-xs">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {caption.badge && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {caption.badge}
              </span>
            )}
            {caption.author && <span className="font-semibold">{caption.author}</span>}
            {caption.meta && <span className="text-white/70">{caption.meta}</span>}
          </p>
          {caption.comment && (
            <p className="mt-1 text-sm break-words whitespace-pre-line">{caption.comment}</p>
          )}
        </div>
        {canModify && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setConfirming(false);
            }}
            aria-label="Действия с фото"
            className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/20"
          >
            <MoreHorizontal className="size-5" />
          </button>
        )}
      </div>
      {canModify && menuOpen && (
        <div className="absolute right-4 bottom-full z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-card text-sm text-foreground shadow-lg">
          {confirming ? (
            <div className="p-3">
              <p className="font-medium">Удалить это фото?</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setDeleting(true);
                    void onDelete().finally(() => {
                      setDeleting(false);
                      setMenuOpen(false);
                      setConfirming(false);
                    });
                  }}
                  className="flex-1 rounded-lg bg-destructive py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  {deleting ? "Удаление..." : "Да, удалить"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-lg bg-surface py-2 text-xs font-semibold disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <Pencil className="size-4" />
                Изменить дату/комментарий
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-destructive transition-colors hover:bg-muted"
              >
                <Trash2 className="size-4" />
                Удалить
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
