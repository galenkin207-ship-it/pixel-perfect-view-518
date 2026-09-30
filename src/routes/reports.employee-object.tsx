import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import {
  EmployeeObjectWorks,
  useEmployeeObjectTitle,
} from "@/components/app/employee-object-works";
import { useApp } from "@/state/use-app";

// Параметры — только через query: в ФИО и названиях объектов бывает «/»,
// а nginx ломает %2F в path.
export const Route = createFileRoute("/reports/employee-object")({
  validateSearch: (search: Record<string, unknown>) => ({
    employee: typeof search["employee"] === "string" ? search["employee"] : "",
    objectId:
      typeof search["objectId"] === "string" || typeof search["objectId"] === "number"
        ? String(search["objectId"])
        : "",
    from: typeof search["from"] === "string" ? search["from"] : "",
    to: typeof search["to"] === "string" ? search["to"] : "",
  }),
  head: () => ({
    meta: [{ title: "Работы сотрудника на объекте — Учёт работ" }],
  }),
  component: EmployeeObjectPage,
});

function EmployeeObjectPage() {
  const { employee, objectId, from, to } = Route.useSearch();
  const { role } = useApp();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const title = useEmployeeObjectTitle(employee, objectId);

  const goBack = () => {
    if (canGoBack) router.history.back();
    else void router.navigate({ to: "/reports" });
  };

  return (
    <AppShell>
      <button
        type="button"
        onClick={goBack}
        className="-ml-1 flex cursor-pointer items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ChevronLeft className="size-4" />
        Назад
      </button>

      {/* Суммы в отчётах видит только администратор — как и саму «Статистику за период». */}
      {role !== "admin" ? (
        <p className="mt-4 text-sm text-muted-foreground">Нет доступа к этому отчёту.</p>
      ) : (
        <>
          <h1 className="mt-3 text-lg font-bold break-words">{title}</h1>
          <div className="mt-1">
            <EmployeeObjectWorks employee={employee} objectId={objectId} from={from} to={to} />
          </div>
        </>
      )}
    </AppShell>
  );
}
