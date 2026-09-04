import type { EmployeeQty, WorkItem } from "@/data/mock";

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Итоговый объём позиции: сумма ручных долей либо общий объём. */
export function itemQty(item: WorkItem) {
  if (item.manual && item.allocations?.length) {
    return round2(item.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0));
  }
  return item.qty;
}

/** Доли по сотрудникам: ручные значения или равное деление общего объёма. */
export function allocationsFor(item: WorkItem, employees: string[]): EmployeeQty[] {
  if (employees.length === 0) return [];
  if (item.manual) {
    return employees.map((e) => ({
      employee: e,
      qty: item.allocations?.find((a) => a.employee === e)?.qty ?? 0,
    }));
  }
  const each = round2(item.qty / employees.length);
  return employees.map((e) => ({ employee: e, qty: each }));
}

/** Приводит позицию к актуальному составу сотрудников. */
export function syncItem(item: WorkItem, employees: string[]): WorkItem {
  const allocations = allocationsFor(item, employees);
  const qty = item.manual
    ? round2(allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0))
    : item.qty;
  return { ...item, allocations, qty };
}

export function recordTotal(items: WorkItem[]) {
  return items.reduce((s, i) => s + itemQty(i) * i.price, 0);
}

/** "Моя запись" — по id автора, если он известен, иначе по ФИО (см. canEditRecord). */
export function isMyRecord(
  currentUser: { id: string; full_name: string },
  record: { created_by: string; created_by_user_id?: string },
) {
  return record.created_by_user_id != null
    ? record.created_by_user_id === currentUser.id
    : record.created_by === currentUser.full_name;
}

/** Кто может редактировать запись: свои — автор, любые — куратор и администратор. */
export function canEditRecord(
  role: "user" | "curator" | "admin",
  currentUser: { id: string; full_name: string },
  record: { created_by: string; created_by_user_id?: string },
) {
  if (role === "admin" || role === "curator") return true;
  return isMyRecord(currentUser, record);
}