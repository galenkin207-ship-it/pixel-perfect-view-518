import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Download,
  Image as ImageIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ExcelJS from "exceljs";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { DateInput } from "@/components/app/date-input";
import { PhotoViewer } from "@/components/app/photo-viewer";
import { SearchableSelect } from "@/components/app/searchable-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { ruToIso } from "@/lib/api-client";
import { allocationsFor, itemQty, recordTotal } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import type { WorkItem, WorkRecord } from "@/data/mock";
import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/reports/detail")({
  validateSearch: (search: Record<string, unknown>) => ({
    employee: typeof search["employee"] === "string" ? search["employee"] : "",
    object: typeof search["object"] === "string" ? search["object"] : "",
    submitter: typeof search["submitter"] === "string" ? search["submitter"] : "",
    from: typeof search["from"] === "string" ? search["from"] : "",
    to: typeof search["to"] === "string" ? search["to"] : "",
    apply: search["apply"] === "1" || search["apply"] === true ? "1" : "",
  }),
  head: () => ({
    meta: [
      { title: "Отчёт по объекту и сотруднику — Учёт работ" },
      {
        name: "description",
        content:
          "Детальный отчёт с раскрытием по дням, записям и объёмам каждого сотрудника, с фотографиями работ.",
      },
      { property: "og:title", content: "Отчёт по объекту и сотруднику — Учёт работ" },
      {
        property: "og:description",
        content:
          "Фильтры по сотруднику, объекту и подавшему, раскрытие день → запись → сотрудники.",
      },
    ],
  }),
  component: ReportDetailPage,
});

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function parseDate(d: string) {
  const [dd, mm, yyyy] = d.split(".").map(Number);
  return new Date(yyyy ?? 1970, (mm ?? 1) - 1, dd ?? 1);
}
function weekday(d: string) {
  return WEEKDAYS[parseDate(d).getDay()] ?? "";
}
function money(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

/** Тройная стрелка вниз (уровень «день») — своя, т.к. в lucide-react есть только одинарная и двойная. */
function ChevronsDownTriple({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m7 3 5 5 5-5" />
      <path d="m7 10 5 5 5-5" />
      <path d="m7 17 5 5 5-5" />
    </svg>
  );
}

type Breakdown = { employee: string; qty: number; unit: string; item: string };

type DayGroup = { date: string; records: WorkRecord[]; total: number };

type SummaryRow = { name: string; unit: string; qty: number; total: number; count: number };

function crewOf(r: WorkRecord) {
  return r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees;
}

function breakdownOf(r: WorkRecord): Breakdown[] {
  const crew = crewOf(r);
  return r.items.flatMap((item) => {
    const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
    return allocs.map((a) => ({
      employee: a.employee,
      qty: a.qty,
      unit: item.unit,
      item: item.name,
    }));
  });
}

/** Доля конкретного сотрудника в объёме позиции (0, если он в ней не участвовал). */
function employeeItemQty(item: WorkItem, employeeName: string, crew: string[]) {
  const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
  return allocs.find((a) => a.employee === employeeName)?.qty ?? 0;
}

function ReportDetailPage() {
  const { records, objects, employees, role, submitterNames } = useApp();
  const isAdmin = role === "admin";
  const isMobile = useIsMobile();
  const search = Route.useSearch();
  const initial = {
    employee: search.employee,
    objectId: search.object,
    submitter: search.submitter,
    from: search.from,
    to: search.to,
  };
  const hasInitial =
    search.apply === "1" ||
    Boolean(
      initial.employee || initial.objectId || initial.submitter || initial.from || initial.to,
    );

  const [employee, setEmployee] = useState(initial.employee);
  const [objectId, setObjectId] = useState(initial.objectId);
  const [submitter, setSubmitter] = useState(initial.submitter);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState<{
    employee: string;
    objectId: string;
    submitter: string;
    from: string;
    to: string;
  } | null>(hasInitial ? initial : null);
  const [sortDesc, setSortDesc] = useState(true);
  const [openDays, setOpenDays] = useState<string[]>([]);
  const [openRecords, setOpenRecords] = useState<string[]>([]);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const [mobileRecord, setMobileRecord] = useState<string | null>(null);
  const [mobileItem, setMobileItem] = useState<string | null>(null);
  const [photoPreviewRecordId, setPhotoPreviewRecordId] = useState<string | null>(null);
  const [dayPhotoViewer, setDayPhotoViewer] = useState<{
    record: WorkRecord;
    index: number;
  } | null>(null);
  const [expandedItemsByRecord, setExpandedItemsByRecord] = useState<Record<string, string[]>>({});
  const [photosOpenByRecord, setPhotosOpenByRecord] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(!hasInitial);

  // При переходе между мобильными "экранами" (список/день) страница
  // рендерится в том же контейнере, реальной навигации не происходит — поэтому
  // скролл нужно сбрасывать руками, иначе новый экран открывается там, где
  // была прокрутка на предыдущем. Открытие/закрытие модалки с разбивкой по
  // виду работ (mobileItem) — это оверлей поверх текущего экрана дня, а не
  // переход на новый экран, поэтому скролл при этом трогать не нужно.
  useEffect(() => {
    const el = document.getElementById("app-scroll-container");
    if (el) el.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [mobileDay]);

  const toggleExpandedItem = (recordId: string, item: string) => {
    setExpandedItemsByRecord((prev) => {
      const cur = prev[recordId] ?? [];
      const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
      return { ...prev, [recordId]: next };
    });
  };

  // Реальные авторы записей + вручную добавленные пользователи (is_submitter).
  const submitters = useMemo(
    () => Array.from(new Set([...records.map((r) => r.created_by), ...submitterNames])).sort(),
    [records, submitterNames],
  );

  const days: DayGroup[] = useMemo(() => {
    if (!applied) return [];
    const filtered = records.filter((r) => {
      if (applied.objectId && r.object_id !== applied.objectId) return false;
      if (applied.submitter && r.created_by !== applied.submitter) return false;
      if (applied.employee && !crewOf(r).includes(applied.employee)) return false;
      // Сравниваем как строки ISO (yyyy-mm-dd), а не через new Date(...):
      // applied.from/to приходят из <input type="date"> в UTC-полночь, а
      // parseDate(r.date) создаёт локальную полночь — из-за разницы часовых
      // поясов при сравнении через getTime() пограничные даты "с" и "по"
      // выпадали из выборки.
      const iso = ruToIso(r.date);
      if (applied.from && iso < applied.from) return false;
      if (applied.to && iso > applied.to) return false;
      return true;
    });
    const map = new Map<string, WorkRecord[]>();
    for (const r of filtered) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    const list = [...map.entries()].map(([date, recs]) => ({
      date,
      records: recs,
      total: recs.reduce((s, r) => {
        if (applied.employee) {
          const crew = crewOf(r);
          return (
            s +
            r.items.reduce(
              (a, item) => a + employeeItemQty(item, applied.employee, crew) * item.price,
              0,
            )
          );
        }
        return s + recordTotal(r.items);
      }, 0),
    }));
    list.sort((a, b) =>
      sortDesc
        ? parseDate(b.date).getTime() - parseDate(a.date).getTime()
        : parseDate(a.date).getTime() - parseDate(b.date).getTime(),
    );
    return list;
  }, [applied, records, sortDesc]);

  const summary: SummaryRow[] = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const day of days) {
      for (const r of day.records) {
        const crew = crewOf(r);
        for (const item of r.items) {
          const qty = applied?.employee
            ? employeeItemQty(item, applied.employee, crew)
            : itemQty(item);
          if (!qty) continue;
          const key = `${item.name}||${item.unit}`;
          const prev = map.get(key) ?? {
            name: item.name,
            unit: item.unit,
            qty: 0,
            total: 0,
            count: 0,
          };
          prev.qty += qty;
          prev.total += qty * item.price;
          prev.count += 1;
          map.set(key, prev);
        }
      }
    }
    return [...map.values()]
      .map((s) => ({ ...s, qty: Math.round(s.qty * 100) / 100 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [days, applied]);

  const exportExcel = async () => {
    const NAVY = "FF2E4A6B";
    const ORANGE = "FFE0611C";
    const LIGHT_BLUE = "FFEFF3F8";
    const LIGHT_ORANGE = "FFFBE7DA";
    const GRAY_TXT = "FF6B665E";
    const WHITE = "FFFFFFFF";
    const BORDER_CLR = "FFD8DDE3";
    const border = {
      top: { style: "thin" as const, color: { argb: BORDER_CLR } },
      bottom: { style: "thin" as const, color: { argb: BORDER_CLR } },
      left: { style: "thin" as const, color: { argb: BORDER_CLR } },
      right: { style: "thin" as const, color: { argb: BORDER_CLR } },
    };
    const fill = (argb: string) => ({
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb },
    });
    // Для целых значений объёма используем формат без десятичных знаков,
    // иначе Excel иногда рисует "пустую" запятую после числа (например, "40,")
    // из-за формата "#,##0.###", применённого к значению без дробной части.
    const qtyNumFmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? "#,##0" : "#,##0.##");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Учёт работ";
    wb.created = new Date();

    // ---------- Лист 1: Отчёт (иерархия день → работа → сотрудники) ----------
    const cols = isAdmin
      ? ["Вид работ", "Ед. изм.", "ФИО", "Кол-во людей", "Объём", "Время", "Сумма, ₽", "Кто подал"]
      : ["Вид работ", "Ед. изм.", "ФИО", "Кол-во людей", "Объём", "Время", "Кто подал"];
    const nCols = cols.length;

    const sheet = wb.addWorksheet("Отчёт", {
      views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
    });
    sheet.columns = [
      { width: 42 },
      { width: 11 },
      { width: 32 },
      { width: 13 },
      { width: 10 },
      { width: 9 },
      ...(isAdmin ? [{ width: 14 }] : []),
      { width: 22 },
    ];

    const titleRow = sheet.addRow([
      objectName ? `ОТЧЁТ ПО ОБЪЕКТУ: ${objectName.toUpperCase()}` : title.toUpperCase(),
    ]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, nCols);
    titleRow.height = 30;
    titleRow.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
    titleRow.getCell(1).fill = fill(NAVY);
    titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    const period =
      applied?.from || applied?.to
        ? `Период: ${applied.from || "…"} — ${applied.to || "настоящее время"}`
        : "Период: весь период — настоящее время";
    const subRow = sheet.addRow([period]);
    sheet.mergeCells(subRow.number, 1, subRow.number, nCols);
    subRow.height = 18;
    subRow.getCell(1).font = {
      name: "Calibri",
      size: 10.5,
      italic: true,
      bold: true,
      color: { argb: "FF5B5650" },
    };
    subRow.getCell(1).fill = fill(ORANGE);
    subRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    sheet.addRow([]);

    let grandTotal = 0;

    for (const day of days) {
      const dateRow = sheet.addRow([`Дата: ${day.date} (${weekday(day.date)})`]);
      sheet.mergeCells(dateRow.number, 1, dateRow.number, isAdmin ? nCols - 2 : nCols - 1);
      dateRow.getCell(1).font = { name: "Calibri", size: 11.5, bold: true, color: { argb: WHITE } };
      dateRow.getCell(1).fill = fill(NAVY);
      dateRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      if (isAdmin) {
        sheet.mergeCells(dateRow.number, nCols - 1, dateRow.number, nCols);
        const totalCell = dateRow.getCell(nCols - 1);
        totalCell.value = `Итого за день: ${Math.round(day.total).toLocaleString("ru-RU")} ₽`;
        totalCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
        totalCell.fill = fill(NAVY);
        totalCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      } else {
        dateRow.getCell(nCols).fill = fill(NAVY);
      }
      dateRow.height = 22;
      grandTotal += day.total;

      const headRow = sheet.addRow(cols);
      headRow.height = 26;
      headRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      let blockIdx = 0;
      for (const r of day.records) {
        const crew = crewOf(r);
        for (const item of r.items) {
          const allAllocs = item.allocations?.length
            ? item.allocations
            : allocationsFor(item, crew);
          // Если задан фильтр по сотруднику — в отчёте показываем только его
          // долю объёма/суммы и его строку в разбивке, а не всю запись целиком.
          const empFilter = applied?.employee || undefined;
          const allocs = empFilter ? allAllocs.filter((a) => a.employee === empFilter) : allAllocs;
          if (empFilter && allocs.length === 0) continue;
          blockIdx += 1;
          const blockFill = blockIdx % 2 === 0 ? LIGHT_BLUE : WHITE;
          const qty = empFilter ? employeeItemQty(item, empFilter, crew) : itemQty(item);
          const sum = Math.round(qty * item.price);

          const mainVals = [
            item.name,
            item.unit,
            allocs.map((a) => a.employee).join(", "),
            allocs.length,
            qty,
            r.time,
            ...(isAdmin ? [sum] : []),
            r.created_by,
          ];
          const mainRow = sheet.addRow(mainVals);
          mainRow.eachCell((cell, colNum) => {
            cell.border = border;
            cell.fill = fill(blockFill);
            if (colNum === 1) {
              cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1F2933" } };
              cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
            } else if (colNum === 5 || (isAdmin && colNum === 7)) {
              cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1F2933" } };
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = colNum === 5 ? qtyNumFmt(qty) : '#,##0" ₽"';
            } else {
              cell.font = { name: "Calibri", size: 11, color: { argb: "FF1F2933" } };
              cell.alignment = { vertical: "middle", horizontal: colNum === 3 ? "left" : "center" };
            }
          });

          for (const a of allocs) {
            const subVals = isAdmin
              ? [a.employee, item.unit, "", "", a.qty, "", Math.round(a.qty * item.price), ""]
              : [a.employee, item.unit, "", "", a.qty, "", ""];
            const subRow2 = sheet.addRow(subVals);
            subRow2.eachCell((cell, colNum) => {
              cell.border = border;
              cell.fill = fill(blockFill);
              cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: GRAY_TXT } };
              if (colNum === 1)
                cell.alignment = { vertical: "middle", horizontal: "left", indent: 3 };
              else if (colNum === 5) {
                cell.alignment = { vertical: "middle", horizontal: "right" };
                cell.numFmt = qtyNumFmt(a.qty);
              } else if (isAdmin && colNum === 7) {
                cell.alignment = { vertical: "middle", horizontal: "right" };
                cell.numFmt = '#,##0" ₽"';
              } else cell.alignment = { vertical: "middle", horizontal: "center" };
            });
          }
        }
      }

      if (isAdmin) {
        const subtotalRow = sheet.addRow([]);
        sheet.mergeCells(subtotalRow.number, 1, subtotalRow.number, nCols - 2);
        const lbl = subtotalRow.getCell(1);
        lbl.value = "Итого за день";
        lbl.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: NAVY } };
        lbl.fill = fill(LIGHT_ORANGE);
        lbl.alignment = { vertical: "middle", horizontal: "right", indent: 2 };
        sheet.mergeCells(subtotalRow.number, nCols - 1, subtotalRow.number, nCols);
        const val = subtotalRow.getCell(nCols - 1);
        val.value = Math.round(day.total);
        val.numFmt = '#,##0" ₽"';
        val.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: NAVY } };
        val.fill = fill(LIGHT_ORANGE);
        val.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
        subtotalRow.height = 20;
      }

      sheet.addRow([]);
    }

    if (isAdmin) {
      const grandRow = sheet.addRow([]);
      sheet.mergeCells(grandRow.number, 1, grandRow.number, nCols - 2);
      const lbl = grandRow.getCell(1);
      lbl.value = "ИТОГО ЗА ВЕСЬ ПЕРИОД";
      lbl.font = { name: "Calibri", size: 12.5, bold: true, color: { argb: WHITE } };
      lbl.fill = fill(NAVY);
      lbl.alignment = { vertical: "middle", horizontal: "right", indent: 2 };
      sheet.mergeCells(grandRow.number, nCols - 1, grandRow.number, nCols);
      const val = grandRow.getCell(nCols - 1);
      val.value = Math.round(grandTotal);
      val.numFmt = '#,##0" ₽"';
      val.font = { name: "Calibri", size: 12.5, bold: true, color: { argb: WHITE } };
      val.fill = fill(NAVY);
      val.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      grandRow.height = 26;
    }

    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    // ---------- Лист 2: Сводная (по видам работ) ----------
    const sumCols = isAdmin
      ? ["Вид работы", "Ед.", "Всего объём", "Записей", "Сумма, ₽"]
      : ["Вид работы", "Ед.", "Всего объём", "Записей"];
    const sSheet = wb.addWorksheet("Сводная", {
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });
    sSheet.columns = [
      { width: 46 },
      { width: 9 },
      { width: 14 },
      { width: 11 },
      ...(isAdmin ? [{ width: 15 }] : []),
    ];

    const sTitle = sSheet.addRow(["СВОДНАЯ ТАБЛИЦА ПО ВИДАМ РАБОТ"]);
    sSheet.mergeCells(sTitle.number, 1, sTitle.number, sumCols.length);
    sTitle.height = 28;
    sTitle.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
    sTitle.getCell(1).fill = fill(NAVY);
    sTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    const sSub = sSheet.addRow([
      `Итого видов работ: ${summary.length}  |  Всего записей: ${summary.reduce((s, x) => s + x.count, 0)}`,
    ]);
    sSheet.mergeCells(sSub.number, 1, sSub.number, sumCols.length);
    sSub.height = 18;
    sSub.getCell(1).font = {
      name: "Calibri",
      size: 10.5,
      italic: true,
      bold: true,
      color: { argb: "FF5B5650" },
    };
    sSub.getCell(1).fill = fill(ORANGE);
    sSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    sSheet.addRow([]);
    const sHead = sSheet.addRow(sumCols);
    sHead.height = 24;
    sHead.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
      cell.fill = fill(NAVY);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = border;
    });

    const firstDataRow = sHead.number + 1;
    summary.forEach((s, idx) => {
      const rowFill = idx % 2 === 0 ? WHITE : LIGHT_BLUE;
      const vals = isAdmin
        ? [s.name, s.unit, s.qty, s.count, Math.round(s.total)]
        : [s.name, s.unit, s.qty, s.count];
      const row = sSheet.addRow(vals);
      row.eachCell((cell, colNum) => {
        cell.border = border;
        cell.fill = fill(rowFill);
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF1F2933" }, bold: colNum === 1 };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 1 ? "left" : colNum === 2 ? "center" : "right",
        };
        if (colNum === 3) cell.numFmt = qtyNumFmt(s.qty);
        if (colNum === 5) cell.numFmt = '#,##0" ₽"';
      });
    });
    const lastDataRow = sHead.number + summary.length;

    if (isAdmin && summary.length) {
      sSheet.addConditionalFormatting({
        ref: `E${firstDataRow}:E${lastDataRow}`,
        rules: [
          {
            type: "dataBar",
            gradient: false,
            minLength: 0,
            maxLength: 100,
            color: { argb: "FFA8C4E0" },
            cfvo: [{ type: "min" }, { type: "max" }],
          } as any,
        ],
      });
    }

    sSheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `otchet-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const objectName = objects.find((o) => o.id === applied?.objectId)?.name;
  const title = applied
    ? applied.objectId && applied.employee
      ? "Отчёт по объекту и сотруднику"
      : applied.employee
        ? "Отчёт по сотруднику"
        : applied.objectId
          ? "Отчёт по объекту"
          : applied.submitter
            ? "Отчёт по подавшему"
            : "Отчёт"
    : "Отчёт";

  const canSubmit = Boolean(employee || objectId || submitter || from || to);

  const reset = () => {
    setEmployee("");
    setObjectId("");
    setSubmitter("");
    setFrom("");
    setTo("");
    setApplied(null);
    setOpenDays([]);
    setOpenRecords([]);
    setMobileDay(null);
    setMobileRecord(null);
    setMobileItem(null);
    setPhotoPreviewRecordId(null);
    setDayPhotoViewer(null);
    setExpandedItemsByRecord({});
    setPhotosOpenByRecord({});
    setFiltersOpen(true);
  };

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const activeDay = days.find((d) => d.date === mobileDay);
  const activeRecord = mobileRecord
    ? days.flatMap((d) => d.records).find((r) => r.id === mobileRecord)
    : undefined;

  // ---------- мобильные экраны ----------
  const itemModal = (() => {
    if (!(isMobile && applied && activeRecord && mobileItem)) return null;
    const crew = crewOf(activeRecord);
    const itemDef = activeRecord.items.find((i) => i.name === mobileItem);
    const itemRows = breakdownOf(activeRecord).filter(
      (row) => row.item === mobileItem && (!applied?.employee || row.employee === applied.employee),
    );
    const itemTotal = itemDef
      ? (applied?.employee ? employeeItemQty(itemDef, applied.employee, crew) : itemQty(itemDef)) *
        itemDef.price
      : 0;
    const close = () => {
      setMobileRecord(null);
      setMobileItem(null);
    };
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:items-center md:justify-center md:p-6">
        <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 md:max-h-[90vh] md:max-w-lg md:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold">{mobileItem}</h2>
            <button onClick={close} aria-label="Закрыть">
              <X className="size-5 text-muted-foreground" />
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
            <h3 className="label-caps">Кто и сколько сделал</h3>
            <div className="mt-2">
              {itemRows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-0"
                >
                  <span className="text-sm font-semibold">{row.employee}</span>
                  <span className="font-mono text-sm font-bold">
                    {row.qty} {row.unit}
                  </span>
                </div>
              ))}
              {itemRows.length === 0 && (
                <p className="text-sm text-muted-foreground">Нет разбивки</p>
              )}
            </div>
            {isAdmin && itemDef && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-card px-4 py-3">
                <span className="text-sm font-semibold">Итого по виду работ</span>
                <span className="font-mono font-bold text-primary">{money(itemTotal)}</span>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  })();

  if (isMobile && applied && activeDay) {
    return (
      <AppShell>
        <MobileHeader
          title={`${weekday(activeDay.date)}, ${activeDay.date}`}
          onBack={() => {
            setMobileRecord(null);
            setMobileItem(null);
            setPhotoPreviewRecordId(null);
            setMobileDay(null);
          }}
        />
        <div className="mt-3 space-y-3">
          {activeDay.records.map((r) => {
            const crew = crewOf(r);
            const recordTotalValue = applied?.employee
              ? r.items.reduce(
                  (s, item) => s + employeeItemQty(item, applied.employee, crew) * item.price,
                  0,
                )
              : recordTotal(r.items);
            const photosShown = photoPreviewRecordId === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <RecordSummary
                  record={r}
                  isAdmin={isAdmin}
                  {...(applied?.employee ? { employeeFilter: applied.employee } : {})}
                  onItemClick={(name) => {
                    setPhotoPreviewRecordId(null);
                    setMobileRecord(r.id);
                    setMobileItem(name);
                  }}
                  onPhotoIconClick={() =>
                    setPhotoPreviewRecordId((cur) => (cur === r.id ? null : r.id))
                  }
                />
                {photosShown && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {r.photos.map((p, i) => (
                      <button
                        key={p}
                        onClick={() => setDayPhotoViewer({ record: r, index: i })}
                        className="size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
                      >
                        <img src={p} alt="Фото к записи" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {isAdmin && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                    <span className="text-sm font-semibold">Итого по записи</span>
                    <span className="font-mono font-bold text-primary">
                      {money(recordTotalValue)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {dayPhotoViewer && (
          <PhotoViewer
            photos={dayPhotoViewer.record.photos}
            initialIndex={dayPhotoViewer.index}
            onClose={() => setDayPhotoViewer(null)}
          />
        )}
        {itemModal}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Отчёт по объекту / сотруднику / подавшему" />

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-sm font-semibold md:hidden"
        >
          <SlidersHorizontal className="size-4" />
          {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
        </button>

        <div
          className={cn(
            "grid gap-3 md:mt-0 md:grid-cols-3",
            filtersOpen ? "mt-3" : "hidden md:grid",
          )}
        >
          <div>
            <FieldLabel>Сотрудник</FieldLabel>
            <div className="mt-1">
              <SearchableSelect
                items={employees.map((e) => ({ id: e, label: e }))}
                value={employee}
                onChange={setEmployee}
                allLabel="Все сотрудники"
                searchPlaceholder="Поиск сотрудника..."
              />
            </div>
          </div>
          <div>
            <FieldLabel>Объект</FieldLabel>
            <div className="mt-1">
              <SearchableSelect
                items={objects.map((o) => ({ id: o.id, label: o.name }))}
                value={objectId}
                onChange={setObjectId}
                allLabel="Все объекты"
                searchPlaceholder="Поиск объекта..."
              />
            </div>
          </div>
          <div>
            <FieldLabel>Подавший</FieldLabel>
            <div className="mt-1">
              <SearchableSelect
                items={submitters.map((s) => ({ id: s, label: s }))}
                value={submitter}
                onChange={setSubmitter}
                allLabel="Все подавшие"
                searchPlaceholder="Поиск по ФИО..."
              />
            </div>
          </div>
          <div>
            <FieldLabel>С даты</FieldLabel>
            <DateInput value={from} onChange={setFrom} className="mt-1 rounded-lg py-2" />
          </div>
          <div>
            <FieldLabel>По дату</FieldLabel>
            <DateInput value={to} onChange={setTo} className="mt-1 rounded-lg py-2" />
          </div>
          <div className="flex items-end gap-2">
            <button
              disabled={!canSubmit}
              onClick={() => {
                setApplied({ employee, objectId, submitter, from, to });
                setOpenDays([]);
                setOpenRecords([]);
                setMobileDay(null);
                setMobileRecord(null);
                if (isMobile) setFiltersOpen(false);
              }}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Сформировать отчёт
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Очистить
            </button>
          </div>
        </div>
        <p className={cn("mt-3 text-xs text-muted-foreground", !filtersOpen && "hidden md:block")}>
          Укажите хотя бы одно поле. Оба сразу — отчёт по конкретному сотруднику именно на этом
          объекте.
        </p>
      </section>

      {applied && (
        <section className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  objectName && `Объект: ${objectName}`,
                  applied.employee && `Сотрудник: ${applied.employee}`,
                  applied.submitter && `Подавший: ${applied.submitter}`,
                  (applied.from || applied.to) &&
                    `Период: ${applied.from || "…"} — ${applied.to || "…"}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Без фильтров"}
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold">
              {applied.from || applied.to ? "выбранный период" : "весь период"}
            </span>
            <button
              onClick={exportExcel}
              disabled={days.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Download className="size-4" />
              Экспорт в Excel
            </button>
          </div>

          <div className="mt-3 inline-flex gap-1 rounded-xl bg-surface p-1">
            {[
              { key: true, label: "По убыванию" },
              { key: false, label: "По возрастанию" },
            ].map((s) => (
              <button
                key={String(s.key)}
                onClick={() => setSortDesc(s.key)}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold",
                  sortDesc === s.key ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {days.length === 0 && (
              <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Нет записей по заданным фильтрам
              </p>
            )}

            {days.map((day) => {
              const open = openDays.includes(day.date);
              const dayPhotoCount = day.records.reduce((s, r) => s + r.photos.length, 0);
              return (
                <div
                  key={day.date}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <button
                    onClick={() => {
                      if (isMobile) {
                        setMobileRecord(null);
                        setMobileItem(null);
                        setMobileDay(day.date);
                      } else {
                        toggle(openDays, setOpenDays, day.date);
                      }
                    }}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface/60"
                  >
                    {isMobile ? (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronsDownTriple
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    )}
                    <span className="flex-1 font-semibold">
                      {weekday(day.date)}, {day.date}
                    </span>
                    {dayPhotoCount > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        <ImageIcon className="size-3.5" />
                        {dayPhotoCount}
                      </span>
                    )}
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">
                      {day.records.length} записей
                    </span>
                    {isAdmin && (
                      <span className="font-mono text-sm font-bold text-primary">
                        {money(day.total)}
                      </span>
                    )}
                  </button>

                  {!isMobile && open && (
                    <div className="space-y-2 border-t border-border bg-surface p-3">
                      {day.records.map((r) => {
                        const rOpen = openRecords.includes(r.id);
                        const openItems = expandedItemsByRecord[r.id] ?? [];
                        const recordPhotosOpen = photosOpenByRecord[r.id] ?? true;
                        const handleItemClick = (name: string) => {
                          if (!openRecords.includes(r.id)) {
                            setOpenRecords([...openRecords, r.id]);
                          }
                          setPhotosOpenByRecord((prev) => ({ ...prev, [r.id]: true }));
                          toggleExpandedItem(r.id, name);
                        };
                        const handlePhotoIconClick = () => {
                          if (!openRecords.includes(r.id)) {
                            setOpenRecords([...openRecords, r.id]);
                          }
                          setPhotosOpenByRecord((prev) => ({ ...prev, [r.id]: true }));
                        };
                        return (
                          <div key={r.id} className="rounded-xl border border-border bg-card">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggle(openRecords, setOpenRecords, r.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggle(openRecords, setOpenRecords, r.id);
                                }
                              }}
                              className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-surface/60"
                            >
                              <ChevronsDown
                                className={cn(
                                  "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                                  rOpen && "rotate-180",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <RecordSummary
                                  record={r}
                                  isAdmin={isAdmin}
                                  {...(applied?.employee
                                    ? { employeeFilter: applied.employee }
                                    : {})}
                                  onItemClick={handleItemClick}
                                  expandedItems={openItems}
                                  onPhotoIconClick={handlePhotoIconClick}
                                />
                              </div>
                            </div>
                            {rOpen && (
                              <div className="border-t border-border p-4">
                                <RecordDetailBlock
                                  record={r}
                                  isAdmin={isAdmin}
                                  nested
                                  {...(applied?.employee
                                    ? { employeeFilter: applied.employee }
                                    : {})}
                                  photosOpen={recordPhotosOpen}
                                  onPhotosOpenChange={(v) =>
                                    setPhotosOpenByRecord((prev) => ({ ...prev, [r.id]: v }))
                                  }
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {summary.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-bold">Сводная таблица по видам работ</h3>
                <p className="text-xs text-muted-foreground">Объёмы со всех дней объединены</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Вид работы</th>
                      <th className="px-4 py-2 text-right font-semibold">Объём</th>
                      <th className="px-4 py-2 text-right font-semibold">Записей</th>
                      {isAdmin && <th className="px-4 py-2 text-right font-semibold">Сумма</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr
                        key={`${s.name}-${s.unit}`}
                        className="border-t border-border transition-colors hover:bg-surface/60"
                      >
                        <td className="px-4 py-2.5 font-medium break-words">{s.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                          {s.qty} {s.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                          {s.count}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-primary whitespace-nowrap">
                            {money(s.total)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {isAdmin && (
                    <tfoot>
                      <tr className="border-t border-border bg-surface/60">
                        <td className="px-4 py-2.5 font-bold" colSpan={3}>
                          Итого
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-primary whitespace-nowrap">
                          {money(summary.reduce((s, r) => s + r.total, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
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

function RecordSummary({
  record,
  isAdmin,
  employeeFilter,
  onItemClick,
  expandedItems,
  onPhotoIconClick,
}: {
  record: WorkRecord;
  isAdmin: boolean;
  employeeFilter?: string;
  onItemClick?: (name: string) => void;
  expandedItems?: string[];
  onPhotoIconClick?: () => void;
}) {
  const crew = crewOf(record);
  // Десктопный инлайн-разворот видов работ (в отличие от мобильной навигации на отдельный экран).
  const isDesktopToggle = Boolean(onItemClick) && expandedItems !== undefined;
  const rows = employeeFilter
    ? record.items
        .map((item) => ({ item, qty: employeeItemQty(item, employeeFilter, crew) }))
        .filter((x) => x.qty > 0)
    : record.items.map((item) => ({ item, qty: itemQty(item) }));
  return (
    <div className="space-y-1.5">
      {rows.map(({ item, qty }, i) => {
        const isOpen = expandedItems?.includes(item.name) ?? false;
        // Когда expandedItems не передан, клик по виду работ ведёт на отдельный экран
        // (мобильная навигация), а не разворачивает разбивку тут же (десктоп).
        const isNavigate = Boolean(onItemClick) && expandedItems === undefined;
        const nameContent = (
          <>
            {item.name}
            {isDesktopToggle && (
              <ChevronDown
                className={cn(
                  "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            )}
          </>
        );
        const itemBreakdown = isOpen
          ? breakdownOf(record).filter(
              (row) =>
                row.item === item.name && (!employeeFilter || row.employee === employeeFilter),
            )
          : [];
        return (
          <div key={i}>
            {isNavigate ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick?.(item.name);
                }}
                title="Показать, кто и сколько сделал по этому виду работ"
                className="-mx-1 flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded px-1 py-0.5 text-left transition-colors active:bg-primary/10"
              >
                <span className="flex min-w-0 flex-1 items-start gap-1.5 font-semibold text-primary break-words whitespace-normal">
                  {nameContent}
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {qty} {item.unit}
                  </span>
                  {isAdmin && (
                    <span className="font-mono text-sm font-bold tabular-nums text-primary">
                      {money(qty * item.price)}
                    </span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-primary" />
                </span>
              </button>
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemClick(item.name);
                    }}
                    title="Показать, кто и сколько сделал по этому виду работ"
                    className={cn(
                      "-mx-1 flex min-w-0 flex-1 items-start gap-1.5 rounded px-1 text-left font-semibold break-words whitespace-normal transition-colors hover:bg-primary/10 hover:text-primary",
                      isOpen && "bg-primary/10 text-primary",
                    )}
                  >
                    {nameContent}
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-1 items-start gap-1.5 font-semibold break-words whitespace-normal">
                    {nameContent}
                  </span>
                )}
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {qty} {item.unit}
                  </span>
                  {isAdmin && (
                    <span className="font-mono text-sm font-bold tabular-nums text-primary">
                      {money(qty * item.price)}
                    </span>
                  )}
                </span>
              </div>
            )}
            {isOpen && (
              <div className="mt-1.5 mb-1 rounded-lg bg-surface/60 px-3 py-2">
                <p className="label-caps text-[11px] text-muted-foreground">Кто и сколько сделал</p>
                <div className="mt-1">
                  {itemBreakdown.map((row, j) => (
                    <div
                      key={j}
                      className="-mx-2 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border-b border-border/60 px-2 py-1.5 transition-colors last:border-0 md:hover:bg-white"
                    >
                      <span className="text-sm font-semibold">{row.employee}</span>
                      <span className="font-mono text-sm font-bold">
                        {row.qty} {row.unit}
                      </span>
                    </div>
                  ))}
                  {itemBreakdown.length === 0 && (
                    <p className="text-xs text-muted-foreground">Нет разбивки</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-sm break-words text-muted-foreground">
        {employeeFilter ? "Сотрудник" : "Сотрудники"}:{" "}
        <span className="text-foreground">
          {employeeFilter ? employeeFilter : crew.join(", ") || "—"}
        </span>
      </p>

      <p className="text-sm text-muted-foreground">
        Кто подал: <span className="text-foreground">{record.created_by}</span>
      </p>

      {record.photos.length > 0 && onPhotoIconClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPhotoIconClick();
          }}
          title="Показать фото"
          className="-mx-1 mt-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-primary transition-colors hover:bg-primary/10"
        >
          <ImageIcon className="size-6" />
        </button>
      )}
    </div>
  );
}

function RecordDetailBlock({
  record,
  isAdmin,
  nested,
  employeeFilter,
  onItemClick,
  photosOpen: photosOpenProp,
  onPhotosOpenChange,
}: {
  record: WorkRecord;
  isAdmin: boolean;
  nested?: boolean;
  employeeFilter?: string;
  onItemClick?: (name: string) => void;
  photosOpen?: boolean;
  onPhotosOpenChange?: (open: boolean) => void;
}) {
  const [internalPhotosOpen, setInternalPhotosOpen] = useState(true);
  const photosOpen = photosOpenProp ?? internalPhotosOpen;
  const setPhotosOpen = onPhotosOpenChange ?? setInternalPhotosOpen;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const crew = crewOf(record);
  const recordTotalValue = employeeFilter
    ? record.items.reduce(
        (s, item) => s + employeeItemQty(item, employeeFilter, crew) * item.price,
        0,
      )
    : recordTotal(record.items);

  // Один вид работ в записи — разбивку показываем сразу, отдельный экран не нужен.
  const singleItem = record.items.length === 1 ? record.items[0] : null;
  const singleItemRows = singleItem
    ? breakdownOf(record).filter(
        (row) =>
          row.item === singleItem.name && (!employeeFilter || row.employee === employeeFilter),
      )
    : [];

  return (
    <div className={cn(!nested && "mt-4 rounded-2xl border border-border bg-card p-4")}>
      {!nested && (
        <RecordSummary
          record={record}
          isAdmin={isAdmin}
          {...(employeeFilter ? { employeeFilter } : {})}
          {...(onItemClick && record.items.length > 1 ? { onItemClick } : {})}
          onPhotoIconClick={() => setPhotosOpen(true)}
        />
      )}

      {!nested && singleItem && (
        <>
          <h3 className="label-caps mt-4">Кто и сколько сделал</h3>
          <div className="mt-2">
            {singleItemRows.map((row, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-0"
              >
                <span className="text-sm font-semibold">{row.employee}</span>
                <span className="font-mono text-sm font-bold">
                  {row.qty} {row.unit}
                </span>
              </div>
            ))}
            {singleItemRows.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет разбивки</p>
            )}
          </div>
        </>
      )}

      {isAdmin && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm font-semibold">Итого по записи</span>
          <span className="font-mono font-bold text-primary">{money(recordTotalValue)}</span>
        </div>
      )}

      <button
        onClick={() => setPhotosOpen(!photosOpen)}
        className="mt-3 flex w-full items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm font-semibold"
      >
        <ChevronDown className={cn("size-4 transition-transform", photosOpen && "rotate-180")} />
        Фото ({record.photos.length})
      </button>
      {photosOpen && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {record.photos.map((p, i) => (
            <button
              key={p}
              onClick={() => setPreviewIndex(i)}
              className="size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
            >
              <img src={p} alt="Фото к записи" className="size-full object-cover" />
            </button>
          ))}
          {record.photos.length === 0 && (
            <p className="text-sm text-muted-foreground">Фотографий нет</p>
          )}
        </div>
      )}

      {previewIndex !== null && (
        <PhotoViewer
          photos={record.photos}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
