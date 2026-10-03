import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  X,
} from "lucide-react";
import { motion, useAnimate } from "framer-motion";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { PhotoViewer } from "@/components/app/photo-viewer";
import { RecordForm } from "@/components/app/record-form";
import { StatusBadge } from "@/components/app/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModalClose } from "@/hooks/use-modal-close";
import { photoThumbUrl } from "@/lib/api-client";
import { formatMoney, formatQty, sortEntriesDesc, type WorkTypeEntry } from "@/lib/employee-stats";
import { canEditRecord } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

// Оверлеи, которые открываются поверх модалки порталом в body (выбор вида
// работ в форме, календарь, меню ⋯, PhotoViewer). Пока такой есть, Esc и
// стрелки — его, а не модалки.
const OVERLAY_SEL = '.fixed, [role="dialog"], [data-radix-popper-content-wrapper]';
function isTopmost(el: HTMLElement | null) {
  for (let n = el?.nextElementSibling; n; n = n.nextElementSibling) {
    if (n.matches(OVERLAY_SEL) || n.querySelector(OVERLAY_SEL)) return false;
  }
  return true;
}

export type BreakdownRow = { key: string; name: string; unit: string };

const PAGE_SIZE = 50;

/**
 * Модалка «таблица видов работ → детализация по виду работ».
 *
 * Список (таблицу видов работ) рисует вызывающий через renderList — так модалка
 * сотрудника на объекте и «Сводная таблица по видам работ» показывают ровно свои
 * таблицы. По клику на строку модалка переключается в детализацию: все позиции
 * записей с этим видом работ из той же выборки (entriesFor), итог считается из них.
 *
 * Своя модалка на портале, а не Radix Dialog: Radix блокирует pointer-events
 * вне окна, и PhotoViewer (тоже портал в body) перестаёт нажиматься.
 * Родительская страница не перемонтируется — её state (раскрытые строки,
 * период, прокрутка) остаётся как был.
 */
export function WorkTypeBreakdownModal({
  title,
  context,
  period,
  rows,
  initialKey = null,
  showMoney,
  qtyDecimals,
  entriesFor,
  renderList,
  onClose,
}: {
  /** Заголовок в режиме списка. */
  title: string;
  /** Контекст в шапке детализации: «Сотрудник — Объект» / «Все объекты». */
  context: string;
  period: string;
  /** Строки таблицы в её текущем порядке — для ‹ › и «3 из 18». */
  rows: BreakdownRow[];
  /** Открыть сразу на детализации этой строки. */
  initialKey?: string | null;
  showMoney: boolean;
  /** Если исходная таблица округляет объём (сводная — до сотых), итог округляем так же. */
  qtyDecimals?: number;
  entriesFor: (key: string) => WorkTypeEntry[];
  renderList: (pick: (key: string) => void) => ReactNode;
  onClose: () => void;
}) {
  const { objects, records, role, currentUser } = useApp();
  const [activeKey, setActiveKey] = useState<string | null>(initialKey);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [photo, setPhoto] = useState<{ photos: string[]; index: number } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { closing, requestClose } = useModalClose(onClose);
  const [panelRef, animatePanel] = useAnimate<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const firstRender = useRef(true);

  const index = activeKey ? rows.findIndex((r) => r.key === activeKey) : -1;
  // После правки записи вид работ может пропасть из таблицы (последнюю запись
  // перенесли на другой вид/объект/дату) — остаёмся в детализации с пустым
  // списком, помня, где он стоял, чтобы ‹ › продолжали работать.
  const lastRow = useRef<{ row: BreakdownRow; index: number } | null>(null);
  if (index >= 0) lastRow.current = { row: rows[index]!, index };
  const row =
    index >= 0
      ? rows[index]
      : activeKey && lastRow.current?.row.key === activeKey
        ? lastRow.current.row
        : undefined;
  const detail = !!row;
  const lastIndex = lastRow.current?.index ?? 0;
  const targetIndex = (delta: number) =>
    index >= 0 ? index + delta : delta > 0 ? lastIndex : lastIndex - 1;

  const editRecord = editId ? records.find((r) => r.id === editId) : undefined;
  const closeForm = useCallback(() => {
    setEditId(null);
    // Фокус обратно в окно — для ← → / Esc; не синхронно (iOS).
    requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
  }, [panelRef]);
  // Запись удалили/она пропала из данных — форму закрываем.
  useEffect(() => {
    if (editId && !editRecord) setEditId(null);
  }, [editId, editRecord]);

  const entries = useMemo(() => (row ? entriesFor(row.key) : []), [row, entriesFor]);
  // Итог — из тех же позиций, что в списке ниже (до сортировки, в порядке обхода
  // исходной таблицы, чтобы и сумма с плавающей точкой совпала со строкой).
  const totals = useMemo(
    () =>
      entries.reduce((acc, e) => ({ qty: acc.qty + e.qty, sum: acc.sum + e.sum }), {
        qty: 0,
        sum: 0,
      }),
    [entries],
  );
  const sorted = useMemo(() => sortEntriesDesc(entries), [entries]);
  const objectName = useCallback(
    (id: string) => objects.find((o) => o.id === id)?.name ?? id,
    [objects],
  );

  const pick = useCallback((key: string) => {
    listScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    setActiveKey(key);
  }, []);
  const backToList = () => setActiveKey(null);
  const go = (delta: number) => {
    const next = rows[targetIndex(delta)];
    if (next) setActiveKey(next.key);
  };
  const goRef = useRef(go);
  goRef.current = go;

  // Смена режима/позиции: страница списка — с начала, прокрутка — наверх
  // (в списке — туда, где была до клика).
  useLayoutEffect(() => {
    setVisible(PAGE_SIZE);
    const el = scrollRef.current;
    if (el) el.scrollTop = activeKey ? 0 : listScrollTop.current;
  }, [activeKey]);

  // Рост/сжатие окна при смене режима — только transform/opacity: размер
  // меняется сразу, а окно плавно «доезжает» из чуть уменьшенного состояния.
  // layout-эффект — чтобы первый кадр не мелькнул без анимации.
  useLayoutEffect(() => {
    if (!panelRef.current) return;
    if (firstRender.current) {
      firstRender.current = false;
      void animatePanel(
        panelRef.current,
        { opacity: [0, 1], scale: [0.96, 1] },
        { duration: 0.2, ease: "easeOut" },
      );
      return;
    }
    void animatePanel(
      panelRef.current,
      { opacity: [0.7, 1], scale: [detail ? 0.94 : 1.03, 1] },
      { duration: 0.22, ease: "easeOut" },
    );
  }, [detail, animatePanel, panelRef]);

  // Фокус в окно (для ← → / Esc), при закрытии — обратно туда, откуда открыли.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => prev?.focus?.({ preventScroll: true }));
    };
  }, [panelRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Открыт просмотр фото, меню, календарь или выбор вида работ — клавиши его.
      if (photo || closing || !isTopmost(overlayRef.current)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // Открыта форма — Esc закрывает только её.
        if (editId) closeForm();
        else requestClose();
        return;
      }
      if (!detail || editId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRef.current(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goRef.current(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, closing, detail, editId, closeForm, requestClose]);

  const navBtn =
    "flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-35 sm:size-9";

  return createPortal(
    <motion.div
      ref={overlayRef}
      data-pull-refresh-ignore
      data-no-swipe-nav
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={(e) => {
        // Клики из PhotoViewer всплывают сюда по React-дереву — закрываем
        // только по самому фону.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-breakdown-title"
        tabIndex={-1}
        className={cn(
          "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl outline-none",
          detail ? "h-full sm:h-[90dvh] sm:max-w-4xl" : "max-h-full sm:max-h-[85dvh] sm:max-w-2xl",
        )}
      >
        {/* Шапка */}
        <div className="shrink-0 border-b border-border p-4 sm:p-5">
          {detail && row ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={backToList}
                  className="flex h-11 min-w-0 shrink items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold transition-colors hover:bg-surface sm:h-9"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="truncate">Назад к списку</span>
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    disabled={targetIndex(-1) < 0}
                    aria-label="Предыдущий вид работ"
                    className={navBtn}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="min-w-[4.5rem] text-center font-mono text-xs text-muted-foreground">
                    {index >= 0 ? index + 1 : "—"} из {rows.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    disabled={targetIndex(1) >= rows.length}
                    aria-label="Следующий вид работ"
                    className={navBtn}
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </div>
                <CloseButton onClick={requestClose} />
              </div>
              <h2
                id="wt-breakdown-title"
                className="mt-3 text-lg leading-snug font-bold break-words"
              >
                {row.name}
              </h2>
              <p className="mt-0.5 text-sm break-words text-muted-foreground">
                {context} · {period}
              </p>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <h2
                id="wt-breakdown-title"
                className="min-w-0 flex-1 text-lg leading-snug font-bold break-words"
              >
                {title}
              </h2>
              <CloseButton onClick={requestClose} />
            </div>
          )}
        </div>

        {/* Содержимое */}
        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5"
          style={{ overscrollBehaviorY: "contain" }}
        >
          {!detail ? (
            renderList(pick)
          ) : (
            <>
              <div className={cn("grid gap-2", showMoney ? "grid-cols-3" : "grid-cols-2")}>
                <Tile
                  label="Объём"
                  value={`${formatQty(
                    qtyDecimals == null
                      ? totals.qty
                      : Math.round(totals.qty * 10 ** qtyDecimals) / 10 ** qtyDecimals,
                  )} ${row?.unit ?? ""}`}
                  accent
                />
                {showMoney && <Tile label="Сумма" value={formatMoney(totals.sum)} money />}
                <Tile label="Записей" value={String(entries.length)} />
              </div>

              {sorted.length === 0 ? (
                <div className="mt-6 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Записей с этим видом работ за период нет.
                  </p>
                  <button
                    type="button"
                    onClick={backToList}
                    className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:bg-surface"
                  >
                    <ArrowLeft className="size-4" />
                    Назад к списку
                  </button>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {sorted.slice(0, visible).map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      unit={row?.unit ?? ""}
                      showMoney={showMoney}
                      objectName={objectName(e.record.object_id)}
                      onPhoto={() => setPhoto({ photos: e.record.photos, index: 0 })}
                      {...(canEditRecord(role, currentUser, e.record)
                        ? { onEdit: () => setEditId(e.record.id) }
                        : {})}
                    />
                  ))}
                </ul>
              )}
              {sorted.length > visible && (
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="mt-3 h-11 w-full rounded-xl border border-border text-sm font-semibold transition-colors hover:bg-surface"
                >
                  Показать ещё ({Math.min(PAGE_SIZE, sorted.length - visible)} из{" "}
                  {sorted.length - visible})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Форма правки — поверх окна детализации, само окно (вид работ,
          прокрутка списка) под ней не трогаем. Закрытие по фону не делаем,
          чтобы случайным тапом не потерять правки: только ✕, Esc, кнопки формы. */}
      {editRecord && (
        <div
          data-pull-refresh-ignore
          data-no-swipe-nav
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-6"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Редактирование записи"
            className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:h-[92dvh] sm:max-w-3xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 sm:px-5">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">
                Запись от {editRecord.date}
              </p>
              <CloseButton onClick={closeForm} />
            </div>
            <div
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5"
              style={{ overscrollBehaviorY: "contain" }}
            >
              <RecordForm key={editRecord.id} record={editRecord} onFinish={closeForm} />
            </div>
          </motion.div>
        </div>
      )}

      {photo && (
        <PhotoViewer
          photos={photo.photos}
          initialIndex={photo.index}
          onClose={() => setPhoto(null)}
        />
      )}
    </motion.div>,
    document.body,
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Закрыть"
      className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface sm:size-9"
    >
      <X className="size-5" />
    </button>
  );
}

function Tile({
  label,
  value,
  accent,
  money,
}: {
  label: string;
  value: string;
  accent?: boolean;
  money?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface p-3">
      <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-base font-bold break-words sm:text-xl",
          accent && "text-primary",
          money && "text-status-done",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EntryRow({
  entry,
  unit,
  showMoney,
  objectName,
  onPhoto,
  onEdit,
}: {
  entry: WorkTypeEntry;
  unit: string;
  showMoney: boolean;
  objectName: string;
  onPhoto: () => void;
  /** Есть только у тех, кому можно править эту запись (canEditRecord). */
  onEdit?: () => void;
}) {
  const r = entry.record;
  const photos = r.photos.length;
  const who =
    r.execution_type === "brigade" && r.brigade_name
      ? `${entry.employees.join(", ")} (бригада ${r.brigade_name})`
      : entry.employees.join(", ");
  return (
    <li className="flex min-w-0 items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-sm font-semibold whitespace-nowrap">
            {r.date}
            {r.time && <span className="ml-1 font-normal text-muted-foreground">{r.time}</span>}
          </span>
          <span className="font-mono text-sm font-semibold whitespace-nowrap text-primary">
            {formatQty(entry.qty)} {unit}
          </span>
          {showMoney && (
            <span className="font-mono text-sm font-semibold whitespace-nowrap text-status-done">
              {formatMoney(entry.sum)}
            </span>
          )}
          {r.status === "draft" && <StatusBadge status={r.status} className="py-0.5" />}
        </div>
        <dl className="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs text-muted-foreground">
          <dt>Сотрудник:</dt>
          <dd className="min-w-0 break-words text-foreground">{who || "—"}</dd>
          <dt>Подал:</dt>
          <dd className="min-w-0 break-words">{r.created_by || "—"}</dd>
          <dt>Объект:</dt>
          <dd className="min-w-0 break-words">{objectName}</dd>
        </dl>
      </div>
      {photos > 0 && (
        <button
          type="button"
          onClick={onPhoto}
          aria-label={`Фото: ${photos}`}
          className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
        >
          <img
            src={photoThumbUrl(r.photos[0] ?? "")}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
          <span className="absolute right-0.5 bottom-0.5 flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
            <Camera className="size-3" />
            {photos}
          </span>
        </button>
      )}
      {onEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Действия с записью"
              onClick={(e) => e.stopPropagation()}
              className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface data-[state=open]:bg-surface"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            data-pull-refresh-ignore
            className="z-[60] min-w-[10rem]"
            // Фокус после закрытия меню уходит в форму, а не обратно на ⋯.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={onEdit} className="min-h-10 gap-2">
              <Pencil className="size-4" />
              Изменить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
