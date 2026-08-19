import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading, SegmentedProgress } from "@/components/app/bits";
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
  const { objects, role } = useApp();
  const [query, setQuery] = useState("");
  const isForeman = role === "user";

  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const filtered = objects.filter(
    (o) =>
      o.name.toLowerCase().includes(query.toLowerCase()) ||
      o.address.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AppShell fab={{ to: "/records/new" }}>
      <PageHeading
        context={isForeman ? `Прораб · ${today}` : `Все объекты компании · ${today}`}
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

            {isForeman && (
              <div className="mt-4">
                <SegmentedProgress percent={o.progress_percent} />
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Готово по этапу</span>
                  <span className="text-sm font-bold">{o.progress_percent}%</span>
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
