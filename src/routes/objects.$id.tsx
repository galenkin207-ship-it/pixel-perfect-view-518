import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Pin,
  PinOff,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { DateInput } from "@/components/app/date-input";
import { PhotoViewer } from "@/components/app/photo-viewer";
import { WorkTypeRecordsModal } from "@/components/app/work-type-records-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { api, photoThumbUrl } from "@/lib/api-client";
import { isMyRecord } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/objects/$id")({
  head: () => ({
    meta: [
      { title: "Виды работ по объекту — Учёт работ" },
      {
        name: "description",
        content: "Выполненные виды работ по объекту, объёмы и фотографии.",
      },
      { property: "og:title", content: "Виды работ по объекту — Учёт работ" },
      {
        property: "og:description",
        content: "Сводка по видам работ на строительном объекте с фильтром по датам.",
      },
    ],
  }),
  component: ObjectRecordsPage,
});

type WorkSummaryPosition = {
  name: string;
  unit: string;
  work_type_id: string | null;
  qty: number;
};

type WorkSummaryDetail = {
  name: string;
  unit: string;
  qty: number;
  days: number;
  people_count: number;
  employees: { employee: string; qty: number }[];
};

type ObjectPhoto = { record_id: number; date: string; file_path: string };

const ROW_HOVER =
  "relative border border-transparent bg-surface transition-all duration-200 hover:z-10 hover:border-border/60 hover:shadow-[0_2px_8px_-3px_rgba(15,23,42,0.4)]";

// GET /work-summary больше не отдаёт отдельный id позиции — строим его сами
// из work_type_id (если позиция привязана к справочнику) или пары name+unit
// (для "ручных" позиций без привязки), чтобы было что использовать как React
// key и как идентификатор для выбора раскрытой строки/загруженной детали.
function positionId(p: { work_type_id: string | null; name: string; unit: string }) {
  return p.work_type_id ?? `${p.name}::${p.unit}`;
}

function formatQty(n: number) {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function MobileHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={onBack}
        className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
      >
        <ChevronLeft className="size-4" />
        Назад
      </button>
      <h1 className="min-w-0 flex-1 text-lg leading-snug font-bold break-words whitespace-normal">
        {title}
      </h1>
    </div>
  );
}

function PositionDetailContent({
  loading,
  detail,
  onOpenRecords,
}: {
  loading: boolean;
  detail: WorkSummaryDetail | null;
  onOpenRecords: () => void;
}) {
  if (loading) {
    return <p className="px-1 py-2 text-sm text-muted-foreground">Загрузка...</p>;
  }
  if (!detail) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          Объём:{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatQty(detail.qty)} {detail.unit}
          </span>
        </span>
        <span>
          Дней работали: <span className="font-semibold text-foreground">{detail.days}</span>
        </span>
        <span>
          Сотрудников участвовало:{" "}
          <span className="font-semibold text-foreground">{detail.people_count}</span>
        </span>
        <button
          type="button"
          onClick={onOpenRecords}
          className="-my-0.5 rounded-lg px-2 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Записи
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {detail.employees.map((e, i) => (
          <div
            key={e.employee}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-card",
              i > 0 && "border-t border-border",
            )}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm break-words">
              <InitialsAvatar name={e.employee} />
              {e.employee}
            </span>
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
              {formatQty(e.qty)} {detail.unit}
            </span>
          </div>
        ))}
        {detail.employees.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">Нет данных</p>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function photoDateKey(iso: string) {
  return String(iso).slice(0, 10);
}

function formatPhotoDateHeader(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const ru = `${String(d ?? 1).padStart(2, "0")}.${String(m ?? 1).padStart(2, "0")}.${y ?? ""}`;
  return `${WEEKDAYS[dt.getDay()]}, ${ru}`;
}

// Группирует уже отсортированные по дате фото в последовательные блоки по дате,
// сохраняя исходный индекс каждого фото в общем массиве (нужен для PhotoViewer,
// который должен листать фото сквозь границы дат, а не только внутри группы).
function groupPhotosByDate(photos: ObjectPhoto[]) {
  const groups: { dateKey: string; items: { photo: ObjectPhoto; index: number }[] }[] = [];
  photos.forEach((photo, index) => {
    const key = photoDateKey(photo.date);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) {
      last.items.push({ photo, index });
    } else {
      groups.push({ dateKey: key, items: [{ photo, index }] });
    }
  });
  return groups;
}

function PhotoGrid({
  photos,
  loading,
  onPhotoClick,
  itemClassName = "size-24 shrink-0",
  gridClassName = "flex flex-wrap gap-2",
  headerClassName = "bg-background/95",
}: {
  photos: ObjectPhoto[] | null;
  loading: boolean;
  onPhotoClick: (dateKey: string, indexInGroup: number) => void;
  itemClassName?: string;
  gridClassName?: string;
  headerClassName?: string;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  }
  if (!photos || photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Фото по этому объекту пока нет</p>;
  }
  const groups = groupPhotosByDate(photos);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.dateKey}>
          <p
            className={cn(
              "sticky top-0 z-10 -mx-1 mb-2 px-1 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur",
              headerClassName,
            )}
          >
            {formatPhotoDateHeader(group.dateKey)}
          </p>
          <div className={gridClassName}>
            {group.items.map(({ photo }, indexInGroup) => (
              <button
                key={`${photo.record_id}-${photo.file_path}`}
                onClick={() => onPhotoClick(group.dateKey, indexInGroup)}
                className={cn(
                  itemClassName,
                  "overflow-hidden rounded-xl border border-border bg-muted",
                )}
              >
                <img
                  src={photoThumbUrl(photo.file_path)}
                  alt="Фото объекта"
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ObjectRecordsPage() {
  const { id } = useParams({ from: "/objects/$id" });
  const {
    objects,
    records,
    role,
    currentUser,
    archiveObject,
    restoreObject,
    pinnedObjectIds,
    hiddenObjectIds,
    showObjectOnHome,
    hideObjectFromHome,
  } = useApp();
  const isMobile = useIsMobile();
  const object = objects.find((o) => o.id === id);
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const canManage = role === "curator" || role === "admin";
  const isForeman = role === "user";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [positions, setPositions] = useState<WorkSummaryPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobilePositionId, setMobilePositionId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<WorkSummaryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordsModalPosition, setRecordsModalPosition] = useState<WorkSummaryPosition | null>(
    null,
  );

  const [photosOpen, setPhotosOpen] = useState(false);
  const [mobilePhotosOpen, setMobilePhotosOpen] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosData, setPhotosData] = useState<ObjectPhoto[] | null>(null);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const [photoViewerDateKey, setPhotoViewerDateKey] = useState<string | null>(null);

  const hasActiveFilters = dateFrom !== "" || dateTo !== "";

  useEffect(() => {
    let cancelled = false;
    setPositionsLoading(true);
    api
      .getObjectWorkSummary(id, dateFrom || undefined, dateTo || undefined)
      .then((res) => {
        if (!cancelled) setPositions(res.positions);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Не удалось загрузить виды работ");
        }
      })
      .finally(() => {
        if (!cancelled) setPositionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, dateFrom, dateTo]);

  // При смене мобильного "экрана" (список/деталь позиции/фото) скроллим
  // наверх — иначе новый экран открывается там, где была прокрутка списка.
  useEffect(() => {
    const el = document.getElementById("app-scroll-container");
    if (el) el.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [mobilePositionId, mobilePhotosOpen]);

  if (!object) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Объект не найден.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
          К списку объектов
        </Link>
      </AppShell>
    );
  }

  const isArchived = object.status === "archived";
  const objectRecords = records.filter((r) => r.object_id === id);
  // Признак "есть записи" считаем так же, как на главной: у "Кто подал" —
  // только свои записи, иначе — все. Иначе кнопка на этой странице и на
  // главной экране будет решать по-разному, есть ли у объекта записи, и
  // состояние "закреплён/скрыт" разъедется.
  const hasRecords = isForeman
    ? objectRecords.some((r) => isMyRecord(currentUser, r))
    : objectRecords.length > 0;
  const isPinned = pinnedObjectIds.includes(object.id);
  const isHidden = hiddenObjectIds.includes(object.id);
  // Показан ли объект сейчас на главном экране — та же логика, что и на
  // самой главной странице и в шторке "Добавить объект".
  const shownOnHome = !isHidden && (hasRecords || isPinned);

  const toggleHome = async () => {
    setPinBusy(true);
    try {
      if (shownOnHome) {
        await hideObjectFromHome(object.id);
        toast.success("Объект откреплён от главного экрана");
      } else {
        await showObjectOnHome(object.id);
        toast.success("Объект возвращён на главный экран");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить видимость объекта");
    } finally {
      setPinBusy(false);
    }
  };

  const runArchive = async () => {
    setBusy(true);
    try {
      await archiveObject(object.id);
      toast.success("Объект перенесён в архив");
      setConfirmArchiveOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async () => {
    setBusy(true);
    try {
      await restoreObject(object.id);
      toast.success("Объект возвращён в активную работу");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (position: WorkSummaryPosition) => {
    setDetailId(positionId(position));
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await api.getObjectWorkSummaryDetail(
        id,
        position,
        dateFrom || undefined,
        dateTo || undefined,
      );
      setDetailData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить детали по виду работ");
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePositionClick = (position: WorkSummaryPosition) => {
    const posId = positionId(position);
    if (isMobile) {
      setMobilePositionId(posId);
      void loadDetail(position);
      return;
    }
    if (expandedId === posId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(posId);
    void loadDetail(position);
  };

  const openPhotos = async () => {
    if (isMobile) setMobilePhotosOpen(true);
    else setPhotosOpen(true);
    setPhotosLoading(true);
    try {
      const res = await api.getObjectPhotos(id, dateFrom || undefined, dateTo || undefined);
      // Сначала свежие: бэкенд не гарантирует порядок, сортируем по дате (ISO,
      // строковое сравнение корректно) с тай-брейком по record_id для одной даты.
      const sorted = [...res.photos].sort((a, b) => {
        const cmp = String(b.date).localeCompare(String(a.date));
        if (cmp !== 0) return cmp;
        return b.record_id - a.record_id;
      });
      setPhotosData(sorted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить фото объекта");
    } finally {
      setPhotosLoading(false);
    }
  };

  const closePhotos = () => {
    setPhotosOpen(false);
    setMobilePhotosOpen(false);
    setPhotoViewerIndex(null);
    setPhotoViewerDateKey(null);
  };

  const closePhotoViewer = () => {
    setPhotoViewerIndex(null);
    setPhotoViewerDateKey(null);
  };

  const dayPhotos =
    photosData && photoViewerDateKey
      ? photosData.filter((p) => photoDateKey(p.date) === photoViewerDateKey)
      : [];

  if (isMobile && mobilePositionId) {
    const position = positions.find((p) => positionId(p) === mobilePositionId);
    return (
      <AppShell>
        <MobileHeader
          title={position?.name ?? ""}
          onBack={() => {
            setMobilePositionId(null);
            setDetailId(null);
            setDetailData(null);
          }}
        />
        <div className="mt-4">
          <PositionDetailContent
            loading={detailLoading}
            detail={detailId === mobilePositionId ? detailData : null}
            onOpenRecords={() => {
              if (position) setRecordsModalPosition(position);
            }}
          />
        </div>
        {recordsModalPosition && (
          <WorkTypeRecordsModal
            objectId={id}
            position={recordsModalPosition}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onClose={() => setRecordsModalPosition(null)}
          />
        )}
      </AppShell>
    );
  }

  if (isMobile && mobilePhotosOpen) {
    return (
      <AppShell>
        <MobileHeader title="Фото объекта" onBack={closePhotos} />
        <div className="mt-4">
          <PhotoGrid
            photos={photosData}
            loading={photosLoading}
            onPhotoClick={(dateKey, indexInGroup) => {
              setPhotoViewerDateKey(dateKey);
              setPhotoViewerIndex(indexInGroup);
            }}
            headerClassName="bg-background/95"
          />
        </div>
        {photoViewerIndex !== null && dayPhotos.length > 0 && (
          <PhotoViewer
            photos={dayPhotos.map((p) => p.file_path)}
            initialIndex={photoViewerIndex}
            onClose={closePhotoViewer}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="md:max-w-4xl">
        <div className="bg-background pt-5 pb-3 desktop:sticky desktop:top-0 desktop:z-20 desktop:border-b desktop:border-border desktop:pt-6 desktop:shadow-[0_8px_12px_-10px_rgba(15,23,42,0.35)] xl:pt-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeading context={object.address} title={object.name} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openPhotos()}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
              >
                <ImageIcon className="size-3.5" />
                Фото
              </button>
              {!isArchived && (
                <button
                  type="button"
                  disabled={pinBusy}
                  onClick={() => void toggleHome()}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {shownOnHome ? (
                    <>
                      <PinOff className="size-3.5" />
                      {pinBusy ? "..." : "Открепить"}
                    </>
                  ) : (
                    <>
                      <Pin className="size-3.5" />
                      {pinBusy ? "..." : "Показать на главном"}
                    </>
                  )}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (isArchived) {
                      void runRestore();
                    } else {
                      setConfirmArchiveOpen(true);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="size-3.5" />
                      {busy ? "..." : "Вернуть из архива"}
                    </>
                  ) : (
                    <>
                      <Archive className="size-3.5" />
                      {busy ? "..." : "Завершить объект"}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {isArchived && (
            <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
              Объект в архиве — работы завершены, новые записи по нему не добавляются.
            </p>
          )}

          <div className="mt-4 flex items-center gap-2 desktop:hidden">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="relative flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold"
            >
              <SlidersHorizontal className="size-4" />
              {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
              {!filtersOpen && hasActiveFilters && (
                <span
                  aria-label="Есть активные фильтры"
                  className="absolute -top-0.5 -right-0.5 block size-2 rounded-full bg-primary ring-2 ring-surface"
                />
              )}
            </button>
          </div>

          <div className={cn("mt-3 max-w-sm", !filtersOpen && "hidden desktop:block")}>
            <label className="block">
              <span className="label-caps">Дата (с — по)</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <DateInput value={dateFrom} onChange={setDateFrom} />
                <DateInput value={dateTo} onChange={setDateTo} />
              </div>
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border divide-y divide-border">
          {positionsLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Загрузка...</p>
          ) : positions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {hasActiveFilters
                ? "За выбранный период работ по этому объекту нет"
                : "По этому объекту работ пока нет"}
            </p>
          ) : (
            positions.map((p) => {
              const posId = positionId(p);
              const isOpen = expandedId === posId;
              return (
                <div key={posId} className={ROW_HOVER}>
                  <button
                    type="button"
                    onClick={() => handlePositionClick(p)}
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-left"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-base font-semibold break-words text-foreground">
                      {p.name}
                      {isMobile ? (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold tabular-nums text-primary">
                      {formatQty(p.qty)} {p.unit}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border bg-card px-4 py-3">
                      <PositionDetailContent
                        loading={detailLoading}
                        detail={detailId === posId ? detailData : null}
                        onOpenRecords={() => setRecordsModalPosition(p)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <AlertDialog
        open={confirmArchiveOpen}
        onOpenChange={(open) => !busy && setConfirmArchiveOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить объект «{object.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Объект будет перенесён в архив: новые записи по нему создавать будет нельзя, а сам
              объект пропадёт из основного списка активных объектов. Все уже внесённые записи и
              история сохранятся, и объект всегда можно будет вернуть из архива обратно в активную
              работу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void runArchive()}>
              {busy ? "Завершаем…" : "Завершить объект"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {photosOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
            onClick={closePhotos}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">Фото объекта</h2>
                <button onClick={closePhotos} aria-label="Закрыть">
                  <X className="size-5 text-muted-foreground" />
                </button>
              </div>
              <div className="mt-4">
                <PhotoGrid
                  photos={photosData}
                  loading={photosLoading}
                  onPhotoClick={(dateKey, indexInGroup) => {
                    setPhotoViewerDateKey(dateKey);
                    setPhotoViewerIndex(indexInGroup);
                  }}
                  itemClassName="aspect-square"
                  gridClassName="grid grid-cols-4 gap-2 sm:grid-cols-6"
                  headerClassName="bg-card/95"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {photoViewerIndex !== null && dayPhotos.length > 0 && (
        <PhotoViewer
          photos={dayPhotos.map((p) => p.file_path)}
          initialIndex={photoViewerIndex}
          onClose={closePhotoViewer}
        />
      )}

      {recordsModalPosition && (
        <WorkTypeRecordsModal
          objectId={id}
          position={recordsModalPosition}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setRecordsModalPosition(null)}
        />
      )}
    </AppShell>
  );
}
