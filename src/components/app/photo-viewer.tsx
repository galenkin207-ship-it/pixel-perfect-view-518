import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

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
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const count = photos.length;
  const canNavigate = count > 1;

  const goPrev = () => setIndex((i) => (i - 1 + count) % count);
  const goNext = () => setIndex((i) => (i + 1) % count);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canNavigate) goPrev();
      else if (e.key === "ArrowRight" && canNavigate) goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canNavigate, onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touchStartX.current === null || !touch) return;
    touchDeltaX.current = touch.clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    if (canNavigate && Math.abs(touchDeltaX.current) > 50) {
      if (touchDeltaX.current > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col bg-black/90"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-16">
        {canNavigate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Предыдущее фото"
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:left-4 md:size-12"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}

        <img
          src={photos[index]}
          alt="Фото к записи, полный размер"
          className="max-h-[75vh] max-w-full rounded-xl object-contain md:max-h-[82vh] md:max-w-[90vw] lg:max-w-[85vw]"
          onClick={(e) => e.stopPropagation()}
        />

        {canNavigate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Следующее фото"
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:right-4 md:size-12"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {canNavigate && (
        <div
          className="flex justify-center gap-2 overflow-x-auto px-4 pb-4 pt-1 md:pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={p + i}
              onClick={() => setIndex(i)}
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
