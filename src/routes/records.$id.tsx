import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { RecordForm } from "@/components/app/record-form";
import { canEditRecord } from "@/lib/record-utils";
import { useApp } from "@/state/use-app";

// returnTo/returnSearch — необязательный "обратный адрес" после сохранения/
// отмены/удаления записи (сейчас единственное значение — "reports-all", для
// возврата на /reports/all с сохранением её фильтров). Без них — прежнее
// поведение (переход на страницу объекта).
// add_wt — позиция справочника из выполненной заявки мастера («Внести в
// запись»): сразу добавляется строкой в эту запись.
type RecordEditSearch = {
  returnTo?: string;
  returnSearch?: string;
  add_wt?: string;
};

export const Route = createFileRoute("/records/$id")({
  validateSearch: (search: Record<string, unknown>): RecordEditSearch => ({
    ...(typeof search["returnTo"] === "string" ? { returnTo: search["returnTo"] } : {}),
    ...(typeof search["returnSearch"] === "string"
      ? { returnSearch: search["returnSearch"] }
      : {}),
    ...(typeof search["add_wt"] === "string" || typeof search["add_wt"] === "number"
      ? { add_wt: String(search["add_wt"]) }
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
  const { returnTo, returnSearch, add_wt } = Route.useSearch();
  const navigate = useNavigate();
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
          {...(add_wt
            ? {
                addWorkTypeId: add_wt,
                onAddWorkTypeDone: () =>
                  void navigate({
                    to: "/records/$id",
                    params: { id },
                    search: {
                      ...(returnTo ? { returnTo } : {}),
                      ...(returnSearch ? { returnSearch } : {}),
                    },
                    replace: true,
                  }),
              }
            : {})}
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
          <p className="text-sm text-muted-foreground">
            {add_wt
              ? "Эта запись удалена — добавить в неё позицию нельзя."
              : "Запись не найдена."}
          </p>
          {add_wt ? (
            <Link
              to="/records/new"
              search={{ add_wt }}
              className="mt-3 inline-block text-sm font-semibold text-primary"
            >
              Новая запись с этой позицией
            </Link>
          ) : (
            <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
              К списку объектов
            </Link>
          )}
        </>
      )}
    </AppShell>
  );
}