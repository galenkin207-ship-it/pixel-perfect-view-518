import type { WorkObject, WorkRecord } from "@/data/mock";
import { allocationsFor } from "@/lib/record-utils";

// Разбивка суммы сотрудника (карточка «Статистика за период» в отчётах).
// Суммы считаются ровно так же, как в buildEmployeeStats на странице отчётов:
// доля сотрудника в позиции (ручная или равное деление по составу/бригаде)
// × цена позиции. Поэтому сумма по объектам = сумме сотрудника в списке,
// а сумма работ на объекте = сумме этого объекта.

export function crewOf(r: WorkRecord) {
  return r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees;
}

function parseRuDate(d: string) {
  const [dd, mm, yyyy] = d.split(".").map(Number);
  return new Date(yyyy ?? 1970, (mm ?? 1) - 1, dd ?? 1);
}

/** Записи в диапазоне дат (from/to — ISO yyyy-mm-dd, пустая строка = без границы). */
export function recordsInRange(records: WorkRecord[], from: string, to: string) {
  return records.filter((r) => {
    const d = parseRuDate(r.date);
    if (from) {
      const f = new Date(from);
      f.setHours(0, 0, 0, 0);
      if (d < f) return false;
    }
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      if (d > t) return false;
    }
    return true;
  });
}

/** Перебирает доли сотрудника: по одной на каждую позицию, где у него ненулевой объём. */
function forEachEmployeeShare(
  records: WorkRecord[],
  employee: string,
  fn: (r: WorkRecord, item: WorkRecord["items"][number], qty: number) => void,
) {
  for (const r of records) {
    const crew = crewOf(r);
    for (const item of r.items) {
      const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
      for (const a of allocs) {
        if (!a.qty || a.employee !== employee) continue;
        fn(r, item, a.qty);
      }
    }
  }
}

export type EmployeeObjectRow = {
  objectId: string;
  objectName: string;
  totalSum: number;
  positions: number;
};

/** Объекты, на которых сотрудник работал в этих записях, по алфавиту. */
export function employeeObjects(
  records: WorkRecord[],
  employee: string,
  objects: WorkObject[],
): EmployeeObjectRow[] {
  const nameById = new Map(objects.map((o) => [o.id, o.name]));
  const map = new Map<string, EmployeeObjectRow>();
  forEachEmployeeShare(records, employee, (r, item, qty) => {
    let row = map.get(r.object_id);
    if (!row) {
      row = {
        objectId: r.object_id,
        objectName: nameById.get(r.object_id) ?? r.object_id,
        totalSum: 0,
        positions: 0,
      };
      map.set(r.object_id, row);
    }
    row.positions += 1;
    row.totalSum += qty * item.price;
  });
  return Array.from(map.values()).sort((a, b) =>
    a.objectName.localeCompare(b.objectName, "ru", { sensitivity: "base" }),
  );
}

export type EmployeeWorkRow = { name: string; unit: string; qty: number; sum: number };

/** Работы сотрудника на объекте, сгруппированные по виду работ + ед. изм., по сумме ↓. */
export function employeeObjectWorks(
  records: WorkRecord[],
  employee: string,
  objectId: string,
): EmployeeWorkRow[] {
  const map = new Map<string, EmployeeWorkRow>();
  forEachEmployeeShare(
    records.filter((r) => r.object_id === objectId),
    employee,
    (_r, item, qty) => {
      const key = `${item.name}||${item.unit}`;
      const row = map.get(key);
      if (row) {
        row.qty += qty;
        row.sum += qty * item.price;
      } else {
        map.set(key, { name: item.name, unit: item.unit, qty, sum: qty * item.price });
      }
    },
  );
  return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
}

export function formatQty(n: number) {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} ₽`;
}

function isoToRu(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** «01.09.2026 – 30.09.2026», «с 01.09.2026», «по 30.09.2026» или «за всё время». */
export function formatPeriod(from: string, to: string) {
  if (from && to) return `${isoToRu(from)} – ${isoToRu(to)}`;
  if (from) return `с ${isoToRu(from)}`;
  if (to) return `по ${isoToRu(to)}`;
  return "за всё время";
}
