import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Мои объекты — Учёт работ" },
      {
        name: "description",
        content:
          "Список строительных объектов прораба: записи за сегодня и прогресс выполнения по этапам.",
      },
      { property: "og:title", content: "Мои объекты — Учёт работ" },
      {
        property: "og:description",
        content: "Фиксация выполненных работ на объекте прямо с телефона.",
      },
    ],
  }),
  component: ObjectsPage,
});

function ObjectsPage() {
  const { objects, role, records, currentUser } = useApp();
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const isForeman = role === "user";

  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const visibleIds = useMemo(() => {
    if (!isForeman) return new Set(objects.map((o) => o.id));
    const mine = records
      .filter((r) => r.created_by === currentUser.full_name)
      .map((r) => r.object_id);
    return new Set([...mine, ...pinned]);
  }, [isForeman, objects, records, currentUser.full_name, pinned]);

  const match = (o: { name: string; address: string }) =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    o.address.toLowerCase().includes(query.toLowerCase());

  const filtered = objects.filter((o) => visibleIds.has(o.id) && match(o));
  const addable = objects.filter((o) => !visibleIds.has(o.id) && match(o));

  return (
    <AppShell fab={{ to: "/records/new" }}>
      <PageHeading
        context={isForeman ? `Кто подал · ${today}` : `Все объекты компании · ${today}`}
        title={isForeman ? "Мои объекты" : "Объекты"}
      />

      <div className="relative mt-4 max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по объекту или адресу..."
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Add object to screen — visible first so it’s always on screen */}
      {isForeman && addable.length > 0 && (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Добавить объект на экран</p>
              <p className="text-xs text-muted-foreground">
                {addable.length} объект{addable.length === 1 ? "" : addable.length < 5 ? "а" : "ов"} можно добавить
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {addable.slice(0, query ? addable.length : 6).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border border-dashed bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPinned((p) => [...p, o.id])}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="size-4" /> На экран
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((o) => (
          <Link
            key={o.id}
            to="/objects/$id"
            params={{ id: o.id }}
            className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold">{o.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{o.address}</p>
              </div>
              <span
                className={
                  o.records_today > 0
                    ? "rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-accent-foreground uppercase"
                    : "rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
                }
              >
                {o.records_today > 0 ? `${o.records_today} записей сегодня` : "Нет записей"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Объектов на экране нет — добавьте объект из блока выше.
        </p>
      )}
    </AppShell>
  );
}
