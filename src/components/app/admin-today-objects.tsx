import { Link } from "@tanstack/react-router";
import {
  Archive,
  Camera,
  Clock,
  FileText,
  Images,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { ObjectPhotoGallery } from "@/components/app/object-photo-gallery";
import { PageStateResetButton } from "@/components/app/page-state-reset";
import { RecordItemsList, RecordPhotoGrid } from "@/components/app/record-detail";
import { StatusBadge } from "@/components/app/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModalClose } from "@/hooks/use-modal-close";
import {
  api,
  type ObjectToday,
  type TodayActivityObject,
  type TodayRecord,
} from "@/lib/api-client";
import { formatMoscowTime } from "@/lib/moscow-date";
import { usePageState } from "@/lib/page-state";
import { itemQty, recordTotal } from "@/lib/record-utils";
import { cn } from "@/lib/utils";

// Главная «Объекты» для администратора: объекты, по которым сегодня (по Москве)
// создавались записи или загружались фото, и экран «Объект за сегодня».
// Для остальных ролей главная не меняется (см. routes/index.tsx).

// date от бэкенда — "yyyy-mm-dd" (сегодня по Москве). Форматируем в UTC от
// полудня, чтобы часовой пояс устройства не сдвинул день.
function formatDayTitle(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

// Перезапрос при возврате на вкладку/в приложение (фокус, visibilitychange).
function useRefetchOnFocus(refetch: () => void) {
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  }, [refetch]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    const onFocus = () => ref.current();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}

export function AdminTodayObjectsPage() {
  const [query, setQuery] = usePageState("/", "query", "");
  const [data, setData] = useState<{ date: string; objects: TodayActivityObject[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openedId, setOpenedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getObjectsTodayActivity();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить объекты");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(() => void load());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.objects ?? [];
    if (!q) return list;
    return list.filter(
      (o) => o.name.toLowerCase().includes(q) || o.address.toLowerCase().includes(q),
    );
  }, [data, query]);

  const dayTitle = data ? formatDayTitle(data.date) : "";

  return (
    <AppShell fab={{ to: "/records/new" }} onRefresh={load}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          context={dayTitle ? `Активность за сегодня · ${dayTitle}` : "Активность за сегодня"}
          title="Объекты"
        />
        <div className="flex items-center gap-2">
          <PageStateResetButton page="/" />
          <Link
            to="/objects/archive"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
          >
            <Archive className="size-3.5" />
            Архив
          </Link>
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

      {loading && !data ? (
        <div
          className="mt-5 grid min-w-0 gap-3 overflow-x-hidden md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          role="status"
          aria-label="Загрузка объектов"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
              <Skeleton className="mt-3 h-6 w-48 rounded-full" />
            </div>
          ))}
        </div>
      ) : error && !data ? (
        <LoadError message={error} onRetry={() => void load()} />
      ) : !data?.objects.length ? (
        <p className="mt-5 text-sm text-muted-foreground">Сегодня активности по объектам нет</p>
      ) : !filtered.length ? (
        <p className="mt-5 text-sm text-muted-foreground">Ничего не найдено</p>
      ) : (
        <div className="mt-5 grid min-w-0 gap-3 overflow-x-hidden md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOpenedId(o.id)}
              className="block min-w-0 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-base leading-snug font-bold break-words">{o.name}</p>
                {o.last_activity_at && (
                  <span
                    title="Последняя активность (МСК)"
                    className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums"
                  >
                    <Clock className="size-3.5" />
                    {formatMoscowTime(o.last_activity_at)}
                  </span>
                )}
              </div>
              {o.address && (
                <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{o.address}</span>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <CountChip active={o.records_count_today > 0}>
                  <FileText className="size-3" />
                  Записей сегодня: {o.records_count_today}
                </CountChip>
                {/* photos_count_today — только фото к записям, фото-отчёты
                    бэкенд считает отдельно (report_photos_today), поэтому
                    числа не пересекаются и не складываются. */}
                <CountChip active={o.photos_count_today > 0}>
                  <Camera className="size-3" />
                  Фото к записям: {o.photos_count_today}
                </CountChip>
                {o.report_photos_today > 0 && (
                  <CountChip active>
                    <Images className="size-3" />
                    Фото-отчёты: {o.report_photos_today}
                  </CountChip>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {openedId && <ObjectTodayOverlay objectId={openedId} onClose={() => setOpenedId(null)} />}
    </AppShell>
  );
}

function CountChip({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
      <p className="mt-1 text-xs break-words text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
      >
        <RefreshCw className="size-3.5" />
        Повторить
      </button>
    </div>
  );
}

type WorkSummaryRow = { key: string; name: string; unit: string; qty: number };

// Сводка видов работ за сегодня: одинаковые позиции из разных записей
// объединяем по work_type_id, а без него — по названию + единице.
function summarizeWorks(records: TodayRecord[]): WorkSummaryRow[] {
  const map = new Map<string, WorkSummaryRow>();
  for (const r of records) {
    for (const item of r.items) {
      const key = item.work_type_id
        ? `wt:${item.work_type_id}`
        : `n:${item.name.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`;
      const row = map.get(key) ?? { key, name: item.name, unit: item.unit, qty: 0 };
      row.qty += itemQty(item);
      map.set(key, row);
    }
  }
  return [...map.values()].map((row) => ({ ...row, qty: Math.round(row.qty * 100) / 100 }));
}

function ObjectTodayOverlay({ objectId, onClose }: { objectId: string; onClose: () => void }) {
  const { closing, requestClose } = useModalClose(onClose);
  const [data, setData] = useState<ObjectToday | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getObjectToday(objectId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные объекта");
    }
  }, [objectId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(() => void load());

  const works = useMemo(() => (data ? summarizeWorks(data.records) : []), [data]);
  const photosToday = data?.records.reduce((s, r) => s + r.photos_today.length, 0) ?? 0;

  // Портал + data-pull-refresh-ignore + overscroll-behavior-y: contain — как в
  // RecordDetail: иначе pull-to-refresh фоновой страницы перехватывает свайп
  // внутри окна и скролл "подвисает" на iOS/Android.
  return createPortal(
    <motion.div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex bg-black/50 md:items-center md:justify-center md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Объект за сегодня"
        className="h-full w-full min-w-0 overflow-x-hidden overflow-y-auto bg-background p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:max-h-[90vh] md:max-w-3xl md:rounded-3xl md:p-6 lg:max-w-4xl"
        style={{ overscrollBehaviorY: "contain" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: closing ? 0 : 1, y: closing ? 16 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Объект за сегодня{data ? ` · ${formatDayTitle(data.date)}` : ""}
            </p>
            <h2 className="mt-0.5 text-lg leading-snug font-bold break-words">
              {data?.object.name ?? "Загрузка..."}
            </h2>
            {data?.object.address && (
              <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{data.object.address}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {!data && error ? (
          <LoadError message={error} onRetry={() => void load()} />
        ) : !data ? (
          <div className="mt-5 space-y-3" role="status" aria-label="Загрузка">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {data.records.length > 0 && (
              <section className="mt-4 min-w-0 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>Сводка за сегодня</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    <CountChip active>
                      <FileText className="size-3" />
                      Записей: {data.records.length}
                    </CountChip>
                    <CountChip active={photosToday > 0}>
                      <Camera className="size-3" />
                      Фото к записям: {photosToday}
                    </CountChip>
                    {data.report_photos.length > 0 && (
                      <CountChip active>
                        <Images className="size-3" />
                        Фото-отчёты: {data.report_photos.length}
                      </CountChip>
                    )}
                  </div>
                </div>
                {works.length > 0 ? (
                  <ul className="mt-3 divide-y divide-border">
                    {works.map((w) => (
                      <li key={w.key} className="flex items-start justify-between gap-3 py-2">
                        <span className="min-w-0 flex-1 text-sm font-semibold break-words">
                          {w.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-bold whitespace-nowrap text-primary tabular-nums">
                          {w.qty} {w.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Виды работ не добавлены</p>
                )}
              </section>
            )}

            {/* «Сегодня» у фото-отчётов — по времени загрузки; у фото,
                загруженного задним числом, подпись показывает его photo_date. */}
            {data.report_photos.length > 0 && (
              <section className="mt-4 min-w-0 rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>Фото-отчёты за сегодня</FieldLabel>
                  <CountChip active>
                    <Images className="size-3" />
                    {data.report_photos.length}
                  </CountChip>
                </div>
                <ObjectPhotoGallery
                  photos={data.report_photos}
                  loading={false}
                  onChanged={() => void load()}
                  flat
                  emptyText="Фото-отчётов за сегодня нет"
                  itemClassName="aspect-square min-w-0"
                  gridClassName="grid grid-cols-4 gap-2 sm:grid-cols-6"
                />
              </section>
            )}

            {data.records.length > 0 && (
              <div className="mt-4 space-y-4">
                {data.records.map((r) => (
                  <TodayRecordCard key={r.id} record={r} />
                ))}
              </div>
            )}

            {!data.records.length && !data.report_photos.length && (
              <p className="mt-4 text-sm text-muted-foreground">
                Сегодня активности по объекту нет
              </p>
            )}
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function TodayRecordCard({ record }: { record: TodayRecord }) {
  const todaySet = useMemo(() => new Set(record.photos_today), [record.photos_today]);
  // Сначала фото, загруженные сегодня, затем остальные.
  const photos = useMemo(
    () => [
      ...record.photos.filter((p) => todaySet.has(p)),
      ...record.photos_today.filter((p) => !record.photos.includes(p)),
      ...record.photos.filter((p) => !todaySet.has(p)),
    ],
    [record.photos, record.photos_today, todaySet],
  );

  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold">Запись от {record.date}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Создана {record.created_date ?? record.date}
            {record.time ? `, ${record.time}` : ""}
          </p>
          <p className="mt-1 text-sm break-words text-muted-foreground">
            Кто подал: <span className="font-semibold text-foreground">{record.created_by}</span>
          </p>
          {record.updated_by && (
            <p className="mt-1 text-xs break-words text-muted-foreground">
              Изменил: <span className="font-semibold text-foreground">{record.updated_by}</span>
              {record.updated_at && <> · {record.updated_at}</>}
            </p>
          )}
        </div>
        <StatusBadge status={record.status} />
      </div>

      {!record.created_today && (
        <p className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
          Фото добавлено сегодня к записи от {record.created_date ?? record.date}
        </p>
      )}

      <RecordItemsList record={record} showPrices />

      {record.comment && (
        <div className="mt-4">
          <FieldLabel>Комментарий</FieldLabel>
          <p className="mt-1 text-sm break-words">{record.comment}</p>
        </div>
      )}

      <div className="mt-4">
        <FieldLabel>Фото записи</FieldLabel>
        <RecordPhotoGrid photos={photos} highlighted={todaySet} />
      </div>

      <div className="mt-4 flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
        <span className="label-caps">Итого по записи</span>
        <span className="font-mono text-lg font-bold">
          {recordTotal(record.items).toLocaleString("ru-RU")} ₽
        </span>
      </div>
    </article>
  );
}
