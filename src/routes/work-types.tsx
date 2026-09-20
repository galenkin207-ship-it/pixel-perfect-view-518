import { createFileRoute } from "@tanstack/react-router";
import { FilePlus2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { WorkRequestDialog } from "@/components/app/work-request-dialog";
import { WorkTypeCatalog } from "@/components/app/work-type-catalog";
import { useBlurOnScroll } from "@/hooks/use-blur-on-scroll";
import { useQuickAddToRecord } from "@/hooks/use-quick-add-to-record";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/work-types")({
  head: () => ({
    meta: [
      { title: "Все виды работ — Учёт работ" },
      {
        name: "description",
        content: "Справочник видов работ: название и единица измерения, с поиском.",
      },
    ],
  }),
  component: WorkTypesPage,
});

function WorkTypesPage() {
  const { role } = useApp();
  return role === "admin" || role === "curator" ? <WorkTypeCatalogPage /> : <MasterWorkTypeCatalogPage />;
}

// Каскад справочника страницей на весь экран. На десктопе страница ровно по
// высоте окна (минус вертикальные паддинги контента AppShell), чтобы колонки
// каскада скроллились каждая внутри себя, а не страница целиком.
const CATALOG_PAGE_CLASS = "flex flex-col desktop:h-[calc(100dvh-3rem)] desktop:xl:h-[calc(100dvh-4rem)]";

// admin/curator: тот же каскад, что и в модалке выбора вида работ (+ правка
// позиций на десктопе).
function WorkTypeCatalogPage() {
  return (
    <AppShell>
      <div className={CATALOG_PAGE_CLASS}>
        <PageHeading context="Справочник" title="Все виды работ" />
        <WorkTypeCatalog className="mt-4 min-h-[28rem] flex-1" />
      </div>
    </AppShell>
  );
}

// Мастер (роль user): тот же каскад, но только для чтения. Быстрое добавление
// позиции в запись — кнопка на карточке позиции, «Заявка» на новый вид работы —
// в шапке.
function MasterWorkTypeCatalogPage() {
  const [requestOpen, setRequestOpen] = useState(false);
  const addToRecord = useQuickAddToRecord();

  // Сворачиваем клавиатуру, как только начинается скролл списка — иначе
  // она закрывает часть позиций и мешает выбирать вид работы.
  useBlurOnScroll("app-scroll-container");

  return (
    <AppShell>
      <div className={CATALOG_PAGE_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <PageHeading context="Справочник" title="Все виды работ" />
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <FilePlus2 className="size-4" />
            Заявка
          </button>
        </div>
        <WorkTypeCatalog
          className="mt-4 min-h-[28rem] flex-1"
          onAddToRecord={(leaf) => void addToRecord(leaf)}
        />
      </div>
      <WorkRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
    </AppShell>
  );
}
