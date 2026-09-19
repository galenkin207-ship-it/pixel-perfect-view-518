import { ChevronDown, Plus, X } from "lucide-react";

import { AutoTextarea } from "@/components/app/work-type-editor-fields";
import { cn } from "@/lib/utils";

// Общий вид поля формы редактора (тот же, что в диалоге).
export const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60";
export const labelClass = "label-caps";

// Строка «Варианты» (режим создания). key нужен только React; showMore —
// раскрыто ли «Ещё» (трудозатраты, код ГЭСН).
export type VariantForm = {
  key: string;
  variantLabel: string;
  unit: string;
  price: string;
  hasPrice: boolean;
  laborHours: string;
  gesnCode: string;
  showMore: boolean;
};

// Единица измерения: селект + быстрый выбор. Единица, которой нет в справочнике
// (ГЭСН-единицы вроде «100 м2»), всё равно показывается выбранной.
export function UnitField({
  value,
  units,
  neighbors,
  showChips,
  onChange,
}: {
  value: string;
  units: string[];
  neighbors: string[];
  showChips: boolean;
  onChange: (unit: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>
        Ед. изм. <span className="text-destructive">*</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="" disabled>
          Выберите ед. изм.
        </option>
        {(value && !units.includes(value) ? [value, ...units] : units).map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      {showChips && <UnitChips neighbors={neighbors} common={units} current={value} onPick={onChange} />}
    </div>
  );
}

// Цена и признак «Цена указана».
export function PriceField({
  price,
  hasPrice,
  onPriceChange,
  onHasPriceChange,
}: {
  price: string;
  hasPrice: boolean;
  onPriceChange: (price: string) => void;
  onHasPriceChange: (hasPrice: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>Цена, руб./ед.</span>
      <div className="flex items-center gap-3">
        <input
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          inputMode="decimal"
          disabled={!hasPrice}
          className={cn(fieldClass, "min-w-0 flex-1")}
        />
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasPrice}
            onChange={(e) => onHasPriceChange(e.target.checked)}
            className="size-4 accent-primary"
          />
          Цена указана
        </label>
      </div>
    </div>
  );
}

// Блок «Варианты»: общая часть позиции (название, состав) живёт выше, здесь —
// по строке на каждый вариант. Из строк получаются отдельные листья справочника
// «<Название> <Вариант>».
export function VariantList({
  name,
  rows,
  rowErrors,
  units,
  neighbors,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  name: string;
  rows: VariantForm[];
  // Ошибки по индексу строки (клиентская проверка или «Строка N: ...» с сервера).
  rowErrors: Record<number, string>;
  units: string[];
  neighbors: string[];
  disabled: boolean;
  onChange: (index: number, patch: Partial<VariantForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const baseName = name.trim();
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const error = rowErrors[i];
        const label = row.variantLabel.trim();
        const moreFilled = Boolean(row.laborHours.trim() || row.gesnCode.trim());
        return (
          <div
            key={row.key}
            data-variant-row={i}
            className={cn(
              "space-y-3 rounded-xl border bg-surface p-3",
              error ? "border-destructive" : "border-border",
            )}
          >
            {rows.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Вариант {i + 1}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(i)}
                  title="Удалить вариант"
                  aria-label={`Удалить вариант ${i + 1}`}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-40"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="space-y-1.5">
              <span className={labelClass}>Вариант</span>
              <AutoTextarea
                singleLine
                value={row.variantLabel}
                onChange={(e) => onChange(i, { variantLabel: e.target.value })}
                placeholder={
                  rows.length > 1
                    ? "Подпись варианта"
                    : "Подпись варианта на карточке (необязательно, если вариант один)"
                }
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <UnitField
                value={row.unit}
                units={units}
                neighbors={neighbors}
                showChips
                onChange={(unit) => onChange(i, { unit })}
              />
              <PriceField
                price={row.price}
                hasPrice={row.hasPrice}
                onPriceChange={(price) => onChange(i, { price })}
                onHasPriceChange={(hasPrice) => onChange(i, { hasPrice })}
              />
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => onChange(i, { showMore: !row.showMore })}
                aria-expanded={row.showMore}
                className="flex items-center gap-1 text-xs font-semibold text-primary"
              >
                <ChevronDown className={cn("size-4 transition-transform", row.showMore && "rotate-180")} />
                Ещё
                {!row.showMore && moreFilled && <span className="size-1.5 rounded-full bg-primary" />}
              </button>
              {row.showMore && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className={labelClass}>Трудозатраты, чел.-ч</span>
                    <input
                      value={row.laborHours}
                      onChange={(e) => onChange(i, { laborHours: e.target.value })}
                      inputMode="decimal"
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>Код ГЭСН</span>
                    <input
                      value={row.gesnCode}
                      onChange={(e) => onChange(i, { gesnCode: e.target.value })}
                      className={fieldClass}
                    />
                  </label>
                </div>
              )}
            </div>
            <p className="text-xs break-words text-muted-foreground">
              В записи будет:{" "}
              <span className="font-semibold text-foreground">{[baseName || "…", label].filter(Boolean).join(" ")}</span>
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-60"
      >
        <Plus className="size-4" />
        Добавить вариант
      </button>
    </div>
  );
}

// Быстрый выбор единицы: как у соседних позиций выбранного родителя и общие
// единицы справочника (без повторов). Полный список — в селекте выше.
function UnitChips({
  neighbors,
  common,
  current,
  onPick,
}: {
  neighbors: string[];
  common: string[];
  current: string;
  onPick: (unit: string) => void;
}) {
  const commonShort = common.filter((u) => !neighbors.includes(u)).slice(0, 6);
  if (neighbors.length === 0 && commonShort.length === 0) return null;
  const chip = (u: string) => (
    <button
      key={u}
      type="button"
      onClick={() => onPick(u)}
      className={cn(
        "rounded-lg border px-2 py-1 text-xs font-semibold transition-colors",
        u === current
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {u}
    </button>
  );
  return (
    <div className="space-y-1 pt-0.5">
      {neighbors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Как у соседних:</span>
          {neighbors.map(chip)}
        </div>
      )}
      {commonShort.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Общие:</span>
          {commonShort.map(chip)}
        </div>
      )}
    </div>
  );
}
