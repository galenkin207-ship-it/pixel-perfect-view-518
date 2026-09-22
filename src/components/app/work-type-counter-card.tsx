import { ChevronLeft, Minus, Plus } from "lucide-react";

import type { WorkTypeCounterStep, WorkTypeTreeNode } from "@/data/work-type-tree";

// Итоговое имя записи с учётом ненулевых инкрементов: "база — ×N этаж, ×M
// м ствола, ×K клапан". "×N единица" — без попытки грамматического
// склонения (step_unit_label в БД не нормализован под все числа), но
// единообразно для любой единицы. Общая функция для живого превью в самой
// карточке и для итогового onPick в record-form.tsx — чтобы они не могли
// разойтись.
export function composeCounterName(
  baseText: string,
  steps: WorkTypeCounterStep[],
  counts: Record<string, number>,
): string {
  const parts = steps
    .filter((step) => (counts[step.id] ?? 0) > 0)
    .map((step) => `×${counts[step.id]} ${step.step_unit_label ?? ""}`.trim());
  return parts.length > 0 ? `${baseText} — ${parts.join(", ")}` : baseText;
}

export function computeCounterTotal(
  base: WorkTypeTreeNode,
  steps: WorkTypeCounterStep[],
  counts: Record<string, number>,
): number {
  return steps.reduce((sum, step) => sum + (counts[step.id] ?? 0) * step.price, base.price);
}

// Карточка-счётчик для базовой позиции с независимыми шаговыми
// модификаторами (is_counter_step=true, см. GET
// /api/work-types/:baseId/counter-steps): открывается вместо мгновенного
// коммита записи, когда пользователь долистывает каскад до такой базовой
// позиции. Один +/- счётчик на каждый независимый шаг, минимум 0, верхнего
// предела нет; итоговая цена = base.price + Σ(count_i × step_i.price).
export function WorkTypeCounterCard({
  base,
  baseText,
  steps,
  counts,
  isAdminLike,
  onChangeCount,
  onConfirm,
  onBack,
}: {
  base: WorkTypeTreeNode;
  baseText: string;
  steps: WorkTypeCounterStep[] | null;
  counts: Record<string, number>;
  isAdminLike: boolean;
  onChangeCount: (stepId: string, delta: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const loading = steps === null;
  const previewText = steps ? composeCounterName(baseText, steps, counts) : baseText;
  const total = steps ? computeCounterTotal(base, steps, counts) : base.price;

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Назад
      </button>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-base font-semibold leading-snug break-words whitespace-normal">{previewText}</p>
        {isAdminLike && base.has_price && (
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            {total.toLocaleString("ru-RU")} ₽ / {base.unit}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
          Загрузка...
        </div>
      ) : steps.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Для этой позиции нет шаговых модификаторов
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {steps.map((step) => {
            const count = counts[step.id] ?? 0;
            return (
              <li
                key={step.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {step.step_unit_label ?? "Шаг"}
                  {isAdminLike && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      +{step.price.toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onChangeCount(step.id, -1)}
                    disabled={count <= 0}
                    className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{count}</span>
                  <button
                    type="button"
                    onClick={() => onChangeCount(step.id, 1)}
                    className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={onConfirm}
        disabled={loading}
        className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Добавить
      </button>
    </div>
  );
}
