import { createFileRoute, Link } from "@tanstack/react-router";
import { ArchiveRestore, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/objects/archive")({
  head: () => ({
    meta: [
      { title: "Архив объектов — Учёт работ" },
      {
        name: "description",
        content: "Завершённые объекты: данные и история работ сохраняются.",
      },
      { property: "og:title", content: "Архив объектов — Учёт работ" },
    ],
  }),
  component: ObjectsArchivePage,
});

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function ObjectsArchivePage() {
  const { objects, role, restoreObject } = useApp();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = role === "curator" || role === "admin";

  const archived = useMemo(() => objects.filter((o) => o.status === "archived"), [objects]);

  const filtered = archived.filter(
    (o) =>
      o.name.toLowerCase().includes(query.toLowerCase()) ||
      o.address.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AppShell>
      <PageHeading context="История" title="Архив объектов" />

      <div className="relative mt-4 w-full max-w-xl lg:max-w-2xl xl:max-w-3xl">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по объекту или адресу..."
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {!archived.length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Здесь будут появляться завершённые объекты. Записи и заявки по ним никуда не пропадают —
          объект просто убирается из основного списка.
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((o) => (
          <div key={o.id} className="group relative">
            <Link
              to="/objects/$id"
              params={{ id: o.id }}
              className="block rounded-2xl border border-border bg-card p-4 opacity-90 transition-shadow hover:shadow-md hover:opacity-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{o.name}</p>
                  {o.address && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{o.address}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  В архиве
                </span>
              </div>
              {o.archived_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Завершён {formatDate(o.archived_at)}
                </p>
              )}
            </Link>
            {canManage && (
              <button
                type="button"
                disabled={busyId === o.id}
                onClick={async () => {
                  setBusyId(o.id);
                  try {
                    await restoreObject(o.id);
                    toast.success("Объект возвращён в активный список");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Не удалось восстановить объект",
                    );
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-primary disabled:opacity-100"
                title="Вернуть объект в активную работу"
              >
                <ArchiveRestore className="size-3.5" />
                {busyId === o.id ? "..." : "Вернуть"}
              </button>
            )}
          </div>
        ))}
        {archived.length > 0 && !filtered.length && (
          <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
        )}
      </div>
    </AppShell>
  );
}
