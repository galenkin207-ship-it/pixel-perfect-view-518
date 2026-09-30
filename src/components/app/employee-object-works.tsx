import { useMemo } from "react";

import {
  employeeObjectWorks,
  formatMoney,
  formatPeriod,
  formatQty,
  recordsInRange,
} from "@/lib/employee-stats";
import { useApp } from "@/state/use-app";

type Props = {
  employee: string;
  objectId: string;
  from: string;
  to: string;
};

/** Заголовок «<ФИО> — <Объект>». Отдельно, чтобы модалка могла отдать его в DialogTitle. */
export function useEmployeeObjectTitle(employee: string, objectId: string) {
  const { objects } = useApp();
  const objectName = objects.find((o) => o.id === objectId)?.name ?? objectId;
  return `${employee} — ${objectName}`;
}

/**
 * Работы сотрудника на объекте за период: общее содержимое модалки (десктоп)
 * и страницы /reports/employee-object (телефон). Заголовок рисует вызывающий.
 */
export function EmployeeObjectWorks({ employee, objectId, from, to }: Props) {
  const { records } = useApp();
  const rows = useMemo(
    () => employeeObjectWorks(recordsInRange(records, from, to), employee, objectId),
    [records, from, to, employee, objectId],
  );
  const total = rows.reduce((s, r) => s + r.sum, 0);

  return (
    <div>
      <p className="text-sm text-muted-foreground">{formatPeriod(from, to)}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Нет работ за выбранный период.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          {/* Широкий экран — таблица */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="bg-surface/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Вид работы</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Объём</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Сумма, ₽</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr
                  key={`${it.name}-${it.unit}`}
                  className="border-t border-border transition-colors hover:bg-surface/60"
                >
                  <td className="px-3 py-2 break-words">{it.name}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap text-primary">
                    {formatQty(it.qty)} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap text-status-done">
                    {formatMoney(it.sum)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface/60">
                <td className="px-3 py-2 font-bold" colSpan={2}>
                  Итого
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap text-primary">
                  {formatMoney(total)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Узкий экран — компактные строки без горизонтального скролла */}
          <ul className="divide-y divide-border sm:hidden">
            {rows.map((it) => (
              <li key={`${it.name}-${it.unit}`} className="flex items-start gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm break-words">{it.name}</span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold text-status-done">
                    {formatMoney(it.sum)}
                  </span>
                  <span className="block font-mono text-xs text-primary">
                    {formatQty(it.qty)} {it.unit}
                  </span>
                </span>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-surface/60 px-3 py-2.5">
              <span className="flex-1 text-sm font-bold">Итого</span>
              <span className="shrink-0 font-mono text-sm font-bold text-primary">
                {formatMoney(total)}
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
