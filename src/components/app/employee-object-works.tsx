import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, useCallback, useMemo } from "react";

import { WorkTypeBreakdownModal } from "@/components/app/work-type-breakdown-modal";
import {
  employeeObjectWorkEntries,
  employeeObjectWorks,
  formatMoney,
  formatPeriod,
  formatQty,
  recordsInRange,
  workTypeKey,
} from "@/lib/employee-stats";
import { cn } from "@/lib/utils";
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

function useEmployeeObjectRows({ employee, objectId, from, to }: Props) {
  const { records } = useApp();
  const inRange = useMemo(() => recordsInRange(records, from, to), [records, from, to]);
  const rows = useMemo(
    () => employeeObjectWorks(inRange, employee, objectId),
    [inRange, employee, objectId],
  );
  return { inRange, rows };
}

/** Строка таблицы, кликабельная, если передан onPick: мышь, Enter/пробел. */
export function pickProps(onPick: ((key: string) => void) | undefined, key: string) {
  if (!onPick) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onPick(key),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPick(key);
      }
    },
  };
}

export const pickableRowClass =
  "cursor-pointer outline-none hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset active:bg-primary/10";

/**
 * Работы сотрудника на объекте за период: общее содержимое модалки и
 * страницы /reports/employee-object. Заголовок рисует вызывающий.
 * С onPick строки кликабельны — открывают детализацию по виду работ.
 */
export function EmployeeObjectWorks({
  onPick,
  ...props
}: Props & { onPick?: (key: string) => void }) {
  const { from, to } = props;
  const { rows } = useEmployeeObjectRows(props);
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
                  {...pickProps(onPick, workTypeKey(it.name, it.unit))}
                  className={cn(
                    "border-t border-border transition-colors",
                    onPick ? pickableRowClass : "hover:bg-surface/60",
                  )}
                >
                  <td className="px-3 py-2 break-words">
                    {it.name}
                    {onPick && (
                      <ChevronRight className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                    )}
                  </td>
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
              <li
                key={`${it.name}-${it.unit}`}
                {...pickProps(onPick, workTypeKey(it.name, it.unit))}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 transition-colors",
                  onPick && pickableRowClass,
                )}
              >
                <span className="min-w-0 flex-1 text-sm break-words">{it.name}</span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold text-status-done">
                    {formatMoney(it.sum)}
                  </span>
                  <span className="block font-mono text-xs text-primary">
                    {formatQty(it.qty)} {it.unit}
                  </span>
                </span>
                {onPick && (
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
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

/**
 * Модалка «Сотрудник — Объект»: таблица видов работ, по клику — детализация
 * по записям (те же период/сотрудник/объект, что у таблицы).
 */
export function EmployeeObjectWorksModal({ onClose, ...props }: Props & { onClose: () => void }) {
  const { employee, objectId, from, to } = props;
  const title = useEmployeeObjectTitle(employee, objectId);
  const { inRange, rows } = useEmployeeObjectRows(props);
  const navRows = useMemo(
    () => rows.map((r) => ({ key: workTypeKey(r.name, r.unit), name: r.name, unit: r.unit })),
    [rows],
  );
  const entriesFor = useCallback(
    (key: string) => employeeObjectWorkEntries(inRange, employee, objectId, key),
    [inRange, employee, objectId],
  );
  return (
    <WorkTypeBreakdownModal
      title={title}
      context={title}
      period={formatPeriod(from, to)}
      rows={navRows}
      showMoney
      entriesFor={entriesFor}
      renderList={(pick) => <EmployeeObjectWorks {...props} onPick={pick} />}
      onClose={onClose}
    />
  );
}
