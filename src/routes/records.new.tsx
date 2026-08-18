import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { RecordForm } from "@/components/app/record-form";

export const Route = createFileRoute("/records/new")({
  head: () => ({
    meta: [
      { title: "Новая запись — Учёт работ" },
      {
        name: "description",
        content: "Фиксация выполненной работы: вид работы, исполнитель, объём, фото и комментарий.",
      },
      { property: "og:title", content: "Новая запись — Учёт работ" },
      { property: "og:description", content: "Форма фиксации выполненных работ на объекте." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewRecordPage,
});

function NewRecordPage() {
  return (
    <AppShell>
      <RecordForm />
    </AppShell>
  );
}
