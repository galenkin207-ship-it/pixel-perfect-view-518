import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { RecordForm } from "@/components/app/record-form";

export const Route = createFileRoute("/records/new")({
  // add_wt — позиция справочника из выполненной заявки мастера («Внести в
  // запись» → «Новая запись»): сразу добавляется строкой в новую запись.
  validateSearch: (search: Record<string, unknown>): { object?: string; add_wt?: string } => {
    const object = typeof search["object"] === "string" ? search["object"] : undefined;
    const addWt =
      typeof search["add_wt"] === "string" || typeof search["add_wt"] === "number"
        ? String(search["add_wt"])
        : undefined;
    return { ...(object ? { object } : {}), ...(addWt ? { add_wt: addWt } : {}) };
  },
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
  const { object, add_wt } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <AppShell>
      <RecordForm
        {...(object ? { defaultObjectId: object } : {})}
        {...(add_wt
          ? {
              addWorkTypeId: add_wt,
              onAddWorkTypeDone: () =>
                void navigate({
                  to: "/records/new",
                  search: object ? { object } : {},
                  replace: true,
                }),
            }
          : {})}
      />
    </AppShell>
  );
}
