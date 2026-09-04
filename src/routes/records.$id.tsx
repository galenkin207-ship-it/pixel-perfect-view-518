import { createFileRoute, Link, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { RecordForm } from "@/components/app/record-form";
import { canEditRecord } from "@/lib/record-utils";
import { useApp } from "@/state/use-app";

// returnTo/returnSearch — необязательный "обратный адрес" после сохранения/
// отмены/удаления записи (сейчас единственное значение — "reports-all", для
// возврата на /reports/all с сохранением её фильтров). Без них — прежнее
// поведение (переход на страницу объекта).
type RecordEditSearch = {
  returnTo?: string;
  returnSearch?: string;
};

export const Route = createFileRoute("/records/$id")({
  validateSearch: (search: Record<string, unknown>): RecordEditSearch => ({
    ...(typeof search["returnTo"] === "string" ? { returnTo: search["returnTo"] } : {}),
    ...(typeof search["returnSearch"] === "string"
      ? { returnSearch: search["returnSearch"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Редактирование записи — Учёт работ" },
      {
        name: "description",
        content:
          "Продолжение заполнения черновика: позиции работ, состав сотрудников, объёмы и фото.",
      },
      { property: "og:title", content: "Редактирование записи — Учёт работ" },
      {
        property: "og:description",
        content: "Дозаполнение и правка записи о выполненных работах.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditRecordPage,
});

function EditRecordPage() {
  const { id } = useParams({ from: "/records/$id" });
  const { returnTo, returnSearch } = Route.useSearch();
  const { records, role, currentUser } = useApp();
  const record = records.find((r) => r.id === id);
  const allowed = record ? canEditRecord(role, currentUser, record) : false;

  return (
    <AppShell>
      {record && allowed ? (
        <RecordForm
          record={record}
          {...(returnTo ? { returnTo } : {})}
          {...(returnSearch ? { returnSearch } : {})}
        />
      ) : record ? (
        <>
          <p className="text-sm text-muted-foreground">
            Редактировать эту запись может только её автор, куратор или администратор.
          </p>
          <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
            К списку объектов
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Запись не найдена.</p>
          <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
            К списку объектов
          </Link>
        </>
      )}
    </AppShell>
  );
}