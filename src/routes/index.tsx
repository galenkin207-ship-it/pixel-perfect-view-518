import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Pin, PinOff, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Мои объекты — Учёт работ" },
      {
        name: "description",
        content: "Список строительных объектов: записи за сегодня и адреса.",
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
  const { objects, records, role, currentUser, pinnedObjectIds, unpinObject } = useApp();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const isForeman = role === "user";

  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  // Объекты, где уже есть записи: для "Кто подал" — только его собственные,
  // для куратора/администратора — записи всех пользователей.
  const objectIdsWithRecords = useMemo(() => {
    const relevant = isForeman
      ? records.filter((r) => r.created_by === currentUser.full_name)
      : records;
    return new Set(relevant.map((r) => r.object_id));
  }, [records, isForeman, currentUser.full_name]);

  const pinnedSet = useMemo(() => new Set(pinnedObjectIds), [pinnedObjectIds]);

  const visibleObjects = useMemo(
    () =>
      objects.filter(
        (o) =>
          o.status !== "archived" &&
          (objectIdsWithRecords.has(o.id) || (isForeman && pinnedSet.has(o.id))),
      ),
    [objects, objectIdsWithRecords, isForeman, pinnedSet],
  );

  const filtered = visibleObjects.filter(
    (o) =>
      o.name.toLowerCase().includes(query.toLowerCase()) ||
      o.address.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AppShell fab={{ to: "/records/new" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          context={isForeman ? `Кто подал · ${today}` : `Все объекты компании · ${today}`}
          title={isForeman ? "Мои объекты" : "Объекты"}
        />
        <div className="flex items-center gap-2">
          <Link
            to="/objects/archive"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
          >
            <Archive className="size-3.5" />
            Архив
          </Link>
          {isForeman && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <Plus className="size-3.5" />
              Добавить объект
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4 w-full max-w-xl lg:max-w-2xl xl:max-w-3xl">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по объекту или адресу..."
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isForeman && !visibleObjects.length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Здесь появятся объекты, на которых вы сделали хотя бы одну запись. Ещё можно закрепить
          объект вручную — кнопка «Добавить объект» выше.
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((o) => {
          const pinnedOnly = isForeman && pinnedSet.has(o.id) && !objectIdsWithRecords.has(o.id);
          return (
            <div key={o.id} className="group relative">
              <Link
                to="/objects/$id"
                params={{ id: o.id }}
                className="block rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{o.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{o.address}</p>
                  </div>
                  <span
                    className={
                      o.records_today > 0
                        ? "shrink-0 rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-accent-foreground uppercase"
                        : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
                    }
                  >
                    {o.records_today > 0 ? `${o.records_today} записей сегодня` : "Нет записей"}
                  </span>
                </div>
              </Link>
              {pinnedOnly && (
                <button
                  type="button"
                  aria-label="Открепить объект"
                  title="Открепить от главного экрана"
                  onClick={async () => {
                    try {
                      await unpinObject(o.id);
                      toast.success("Объект откреплён");
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Не удалось открепить объект",
                      );
                    }
                  }}
                  className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-status-rejected"
                >
                  <Pin className="size-3.5 fill-primary text-primary" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isForeman && (
        <ObjectPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} pinnedSet={pinnedSet} />
      )}
    </AppShell>
  );
}

function ObjectPickerDialog({
  open,
  onOpenChange,
  pinnedSet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pinnedSet: Set<string>;
}) {
  const { objects, pinObject, unpinObject } = useApp();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = objects
    .filter((o) => o.status !== "archived")
    .filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = async (id: string, pinned: boolean) => {
    setBusyId(id);
    try {
      if (pinned) {
        await unpinObject(id);
      } else {
        await pinObject(id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить закрепление");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить объект на главный экран</DialogTitle>
          <DialogDescription>
            Закреплённый объект будет показываться среди ваших объектов, даже если на нём ещё нет
            ваших записей.
          </DialogDescription>
        </DialogHeader>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по объекту..."
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-xl border border-border">
          {filtered.map((o) => {
            const pinned = pinnedSet.has(o.id);
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.address}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => toggle(o.id, pinned)}
                  className={
                    pinned
                      ? "flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-60"
                      : "flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                  }
                >
                  {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  {pinned ? "Открепить" : "Закрепить"}
                </button>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
