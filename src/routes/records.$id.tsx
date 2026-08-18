import { createFileRoute, Link, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { RecordForm } from "@/components/app/record-form";
import { useApp } from "@/state/app-context";

export const Route = createFileRoute("/records/$id")({
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
  const { records } = useApp();
  const record = records.find((r) => r.id === id);

  return (
    <AppShell>
      {record ? (
        <RecordForm record={record} />
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