import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { smartFilter } from "@/lib/smart-search";
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

const PER_PAGE = 30;

function WorkTypesPage() {
  const { workTypes, role } = useApp();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const isAdminLike = role === "admin" || role === "curator";

  const filtered = useMemo(() => smartFilter(workTypes, q, (w) => w.name), [workTypes, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const handleSearch = (v: string) => {
    setQ(v);
    setPage(0);
  };

  return (
    <AppShell>
      <PageHeading context={`Справочник · ${workTypes.length} позиций`} title="Все виды работ" />

      <div className="relative mt-4 w-full max-w-xl lg:max-w-2xl xl:max-w-3xl">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Поиск по виду работ..."
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {pageItems.map((w) => (
            <li
              key={w.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 flex-1 text-sm font-medium break-words">{w.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:gap-0">
                <span className="sm:w-16 sm:text-right">{w.unit}</span>
                {isAdminLike && (
                  <span className="font-semibold text-foreground sm:w-24 sm:text-right">
                    {w.price.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </span>
            </li>
          ))}
          {!pageItems.length && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </li>
          )}
        </ul>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-xs text-muted-foreground">
            Стр. {page + 1} из {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Далее
          </button>
        </div>
      )}
    </AppShell>
  );
}
