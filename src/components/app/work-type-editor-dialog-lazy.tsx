import { lazy, Suspense, useEffect, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";

import type { WorkTypeEditorDialog as WorkTypeEditorDialogImpl } from "@/components/app/work-type-editor-dialog";

// Модалка редактора справочника тяжёлая (~20 kB gzip) и открывается только по
// клику — выносим её в отдельный чанк, чтобы не грузить вместе с экраном.
const loadWorkTypeEditorDialog = () => import("@/components/app/work-type-editor-dialog");

const LazyDialog = lazy(() =>
  loadWorkTypeEditorDialog().then((m) => ({ default: m.WorkTypeEditorDialog })),
);

// Фоновая подгрузка чанка, когда браузер простаивает: к моменту клика модалка
// обычно уже в кэше и открывается без ожидания. enabled — только для тех, кто
// реально может редактировать.
export function usePreloadWorkTypeEditorDialog(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const preload = () => void loadWorkTypeEditorDialog().catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(id);
  }, [enabled]);
}

// Пока чанк грузится — только спиннер поверх страницы, без затемнения: иначе
// затемнение моргнёт при подмене на оверлей настоящей модалки.
export function WorkTypeEditorDialog(props: ComponentProps<typeof WorkTypeEditorDialogImpl>) {
  return (
    <Suspense
      fallback={
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div className="rounded-full bg-surface p-3 shadow-lg">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        </div>
      }
    >
      <LazyDialog {...props} />
    </Suspense>
  );
}
