import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Pin, PinOff, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

// WorkRecord.date хранится в виде "dd.mm.yyyy" — парсим в Date для сравнения
// с сегодняшней датой (без времени).
function parseRuDate(ru: string): Date | null {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function pluralizeRecords(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

// Порог "активности" объекта — если по нему есть хотя бы одна запись за это
// количество последних календарных дней (включая сегодня), на карточке
// показывается светящийся индикатор.
const ACTIVE_WINDOW_DAYS = 15;

function ObjectsPage() {
  const {
    objects,
    records,
    role,
    currentUser,
    pinnedObjectIds,
    hiddenObjectIds,
    hideObjectFromHome,
  } = useApp();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const isForeman = role === "user";

  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  // Записи, видимые для текущей роли: у "Кто подал" — только свои,
  // у куратора/администратора — записи всех пользователей.
  const relevantRecords = useMemo(
    () => (isForeman ? records.filter((r) => r.created_by === currentUser.full_name) : records),
    [records, isForeman, currentUser.full_name],
  );

  // Объекты, где уже есть записи.
  const objectIdsWithRecords = useMemo(
    () => new Set(relevantRecords.map((r) => r.object_id)),
    [relevantRecords],
  );

  // Кол-во записей "сегодня" и признак активности объекта. Backend не отдаёт
  // такие агрегаты вместе с объектом, поэтому считаем на фронте из уже
  // загруженного списка записей.
  const objectStats = useMemo(() => {
    const map = new Map<string, { today: number; active: boolean }>();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const r of relevantRecords) {
      if (!r.object_id) continue;
      const recordDate = parseRuDate(r.date);
      if (!recordDate) continue;
      const diffDays = Math.round((startOfToday.getTime() - recordDate.getTime()) / 86_400_000);
      const entry = map.get(r.object_id) ?? { today: 0, active: false };
      if (diffDays === 0) entry.today += 1;
      if (diffDays >= 0 && diffDays < ACTIVE_WINDOW_DAYS) entry.active = true;
      map.set(r.object_id, entry);
    }
    return map;
  }, [relevantRecords]);

  const pinnedSet = useMemo(() => new Set(pinnedObjectIds), [pinnedObjectIds]);
  const hiddenSet = useMemo(() => new Set(hiddenObjectIds), [hiddenObjectIds]);

  // Объект показывается на главном экране, если по нему есть записи (или он
  // закреплён вручную) и пользователь его не открепил. Открепление — личная
  // настройка: объект не архивируется и остаётся доступен через поиск в
  // "Управление -> Объекты" и в сheete "Добавить объект" ниже.
  const visibleObjects = useMemo(
    () =>
      objects.filter(
        (o) =>
          o.status !== "archived" &&
          !hiddenSet.has(o.id) &&
          (objectIdsWithRecords.has(o.id) || pinnedSet.has(o.id)),
      ),
    [objects, objectIdsWithRecords, pinnedSet, hiddenSet],
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
          {role === "admin" && (
            <Link
              to="/objects/archive"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <Archive className="size-3.5" />
              Архив
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Добавить объект
          </button>
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

      {!visibleObjects.length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Здесь появятся объекты с записями. Ещё можно закрепить объект вручную — кнопка «Добавить
          объект» выше.
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((o) => {
          const stats = objectStats.get(o.id);
          const recordsToday = stats?.today ?? 0;
          const isActive = stats?.active ?? false;
          return (
            <div key={o.id} className="group relative min-h-20">
              <Link
                to="/objects/$id"
                params={{ id: o.id }}
                className="block rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-base font-bold">
                      <span className="truncate">{o.name}</span>
                      {isActive && (
                        <span
                          title={`Есть записи за последние ${ACTIVE_WINDOW_DAYS} дней`}
                          className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
                        />
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{o.address}</p>
                  </div>
                  <span
                    className={
                      recordsToday > 0
                        ? "shrink-0 rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-accent-foreground uppercase"
                        : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
                    }
                  >
                    {recordsToday > 0
                      ? `${recordsToday} ${pluralizeRecords(recordsToday)} сегодня`
                      : "Сегодня записей нет"}
                  </span>
                </div>
              </Link>
              {/* Кнопка стоит строго под бейджем, в его же правой колонке —
                  слева там текст названия/адреса, поэтому пересечься с ними
                  она не может независимо от длины адреса или высоты карточки. */}
              <button
                type="button"
                aria-label="Открепить объект с главного экрана"
                title="Открепить с главного экрана"
                onClick={async () => {
                  try {
                    await hideObjectFromHome(o.id);
                    toast.success("Объект откреплён от главного экрана");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Не удалось открепить объект");
                  }
                }}
                className="absolute top-11 right-3 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-status-rejected"
              >
                <PinOff className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <ObjectPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        pinnedSet={pinnedSet}
        hiddenSet={hiddenSet}
        objectIdsWithRecords={objectIdsWithRecords}
      />
    </AppShell>
  );
}

function ObjectPickerDialog({
  open,
  onOpenChange,
  pinnedSet,
  hiddenSet,
  objectIdsWithRecords,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pinnedSet: Set<string>;
  hiddenSet: Set<string>;
  objectIdsWithRecords: Set<string>;
}) {
  const { objects, showObjectOnHome, hideObjectFromHome } = useApp();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = objects
    .filter((o) => o.status !== "archived")
    .filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  // Показан ли объект сейчас на главном экране: если по нему есть записи —
  // достаточно, что он не откреплён вручную; если записей нет — только если
  // закреплён вручную.
  const isShown = (o: { id: string }) =>
    !hiddenSet.has(o.id) && (objectIdsWithRecords.has(o.id) || pinnedSet.has(o.id));

  const toggle = async (o: { id: string }) => {
    const shown = isShown(o);
    setBusyId(o.id);
    try {
      if (shown) {
        await hideObjectFromHome(o.id);
      } else {
        await showObjectOnHome(o.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить видимость объекта");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg sm:max-w-lg">
        <SheetHeader className="shrink-0 text-left">
          <SheetTitle>Объекты на главном экране</SheetTitle>
          <SheetDescription>
            Здесь можно закрепить объект без записей или вернуть на главный экран объект, который вы
            ранее открепили.
          </SheetDescription>
        </SheetHeader>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по объекту..."
          className="mt-1 w-full shrink-0 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <ul className="-mx-6 min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border px-6">
          {filtered.map((o) => {
            const shown = isShown(o);
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.address}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => toggle(o)}
                  className={
                    shown
                      ? "flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-60"
                      : "flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                  }
                >
                  {shown ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  {shown ? "Открепить" : "Закрепить"}
                </button>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="py-6 text-center text-sm text-muted-foreground">Ничего не найдено</li>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
