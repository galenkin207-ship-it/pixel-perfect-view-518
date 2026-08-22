import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { allocationsFor, itemQty } from "@/lib/record-utils";
import { roleLabels, type WorkObject, type WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Отчёты и дашборд — Учёт работ" },
      {
        name: "description",
        content:
          "Сводка по выполненным работам: метрики за период, разбивка по объектам и подробные отчёты.",
      },
      { property: "og:title", content: "Отчёты и дашборд — Учёт работ" },
      {
        property: "og:description",
        content: "Метрики за неделю и месяц, свод по объектам, выгрузка в Excel.",
      },
    ],
  }),
  component: ReportsPage,
});

const periods = ["Эта неделя", "Месяц"] as const;

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function parseDate(d: string) {
  const [dd, mm, yyyy] = d.split(".").map(Number);
  return new Date(yyyy ?? 1970, (mm ?? 1) - 1, dd ?? 1);
}

function crewOf(r: WorkRecord) {
  return r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees;
}

function formatQty(n: number) {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

type StatsRow = {
  key: string;
  label: string;
  positions: number;
  totalValue: number;
  items: { name: string; unit: string; qty: number }[];
};

function finalizeStatsRows(
  map: Map<
    string,
    { positions: number; totalValue: number; items: Map<string, { qty: number; unit: string }> }
  >,
  labelFor: (key: string) => string,
): StatsRow[] {
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: labelFor(key),
      positions: v.positions,
      totalValue: v.totalValue,
      items: Array.from(v.items.entries())
        .map(([nameUnit, d]) => ({
          name: nameUnit.split("||")[0] ?? nameUnit,
          unit: d.unit,
          qty: d.qty,
        }))
        .sort((a, b) => b.qty - a.qty),
    }))
    .sort((a, b) => b.positions - a.positions);
}

/** Статистика по сотрудникам: "позиция" — это участие сотрудника в одной строке
 * вида работ (запись может делить один вид работ между несколькими людьми). */
function buildEmployeeStats(records: WorkRecord[]): StatsRow[] {
  const map = new Map<
    string,
    { positions: number; totalValue: number; items: Map<string, { qty: number; unit: string }> }
  >();
  for (const r of records) {
    const crew = crewOf(r);
    for (const item of r.items) {
      const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
      for (const a of allocs) {
        if (!a.qty) continue;
        let entry = map.get(a.employee);
        if (!entry) {
          entry = { positions: 0, totalValue: 0, items: new Map() };
          map.set(a.employee, entry);
        }
        entry.positions += 1;
        entry.totalValue += a.qty * item.price;
        const key = `${item.name}||${item.unit}`;
        const existing = entry.items.get(key);
        if (existing) existing.qty += a.qty;
        else entry.items.set(key, { qty: a.qty, unit: item.unit });
      }
    }
  }
  return finalizeStatsRows(map, (k) => k);
}

/** Статистика по объектам: "позиция" — одна строка вида работ в записи на этом объекте. */
function buildObjectStats(records: WorkRecord[], objects: WorkObject[]): StatsRow[] {
  const nameById = new Map(objects.map((o) => [o.id, o.name]));
  const map = new Map<
    string,
    { positions: number; totalValue: number; items: Map<string, { qty: number; unit: string }> }
  >();
  for (const r of records) {
    for (const item of r.items) {
      let entry = map.get(r.object_id);
      if (!entry) {
        entry = { positions: 0, totalValue: 0, items: new Map() };
        map.set(r.object_id, entry);
      }
      const qty = itemQty(item);
      entry.positions += 1;
      entry.totalValue += qty * item.price;
      const key = `${item.name}||${item.unit}`;
      const existing = entry.items.get(key);
      if (existing) existing.qty += qty;
      else entry.items.set(key, { qty, unit: item.unit });
    }
  }
  return finalizeStatsRows(map, (id) => nameById.get(id) ?? id);
}

function ReportsPage() {
  const { records, objects, role, employees, workTypes } = useApp();
  const [period, setPeriod] = useState<(typeof periods)[number]>("Эта неделя");
  const [grouping, setGrouping] = useState<"employees" | "objects">("employees");
  const [statsFrom, setStatsFrom] = useState("");
  const [statsTo, setStatsTo] = useState("");
  const [statsOpen, setStatsOpen] = useState(false);
  const [expandedStatsKey, setExpandedStatsKey] = useState<string | null>(null);
  const [rObject, setRObject] = useState("");
  const [rEmployee, setREmployee] = useState("");
  const [rSubmitter, setRSubmitter] = useState("");
  const [rFrom, setRFrom] = useState("");
  const [rTo, setRTo] = useState("");

  const now = new Date();
  const currentYear = now.getFullYear();
  const [svodMonth, setSvodMonth] = useState(now.getMonth());
  const [svodYear, setSvodYear] = useState(currentYear);
  const [svodBusy, setSvodBusy] = useState(false);

  const svodYears = useMemo(() => {
    const years = new Set(records.map((r) => parseDate(r.date).getFullYear()));
    years.add(currentYear);
    return [...years].sort((a, b) => b - a);
  }, [records, currentYear]);

  const isAdmin = role === "admin";

  const exportMonthlySummary = async () => {
    const monthRecords = records.filter((r) => {
      const d = parseDate(r.date);
      return d.getMonth() === svodMonth && d.getFullYear() === svodYear;
    });

    if (!monthRecords.length) {
      toast.error(`Нет записей за ${(monthNames[svodMonth] ?? "").toLowerCase()} ${svodYear}`);
      return;
    }

    setSvodBusy(true);
    try {
      const NAVY = "FF2E4A6B";
      const ORANGE = "FFE0611C";
      const GRAY_TXT = "FF6B665E";
      const LIGHT_BLUE = "FFEFF3F8";
      const LIGHT_BEIGE = "FFF2EFE7";
      const LIGHT_ORANGE = "FFFCEFD9";
      const WHITE = "FFFFFFFF";
      const DARK_TXT = "FF1F2933";
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
      const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} ₽`;
      const monthLabel = `${monthNames[svodMonth] ?? ""} ${svodYear}`;
      const daysInMonth = new Date(svodYear, svodMonth + 1, 0).getDate();
      const dayCols = Array.from({ length: daysInMonth }, (_, i) => i + 1);

      // ---------- Подготовка данных ----------
      type WorkTypeAgg = {
        name: string;
        unit: string;
        price: number;
        perDay: number[];
        employees: Map<string, number[]>;
        submitters: Set<string>;
      };

      const buildAgg = (recs: WorkRecord[]) => {
        const map = new Map<string, WorkTypeAgg>();
        for (const r of recs) {
          const day = parseDate(r.date).getDate() - 1;
          if (day < 0 || day >= daysInMonth) continue;
          const crew = crewOf(r);
          for (const item of r.items) {
            const key = `${item.name}||${item.unit}`;
            let entry = map.get(key);
            if (!entry) {
              entry = {
                name: item.name,
                unit: item.unit,
                price: item.price,
                perDay: new Array<number>(daysInMonth).fill(0),
                employees: new Map(),
                submitters: new Set(),
              };
              map.set(key, entry);
            }
            entry.perDay[day] = (entry.perDay[day] ?? 0) + itemQty(item);
            entry.submitters.add(r.created_by);
            const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
            for (const a of allocs) {
              let arr = entry.employees.get(a.employee);
              if (!arr) {
                arr = new Array<number>(daysInMonth).fill(0);
                entry.employees.set(a.employee, arr);
              }
              arr[day] = (arr[day] ?? 0) + a.qty;
            }
          }
        }
        return map;
      };

      const sortRu = (a: string, b: string) => a.localeCompare(b, "ru");

      const objectsWithRecords = objects
        .filter((o) => monthRecords.some((r) => r.object_id === o.id))
        .sort((a, b) => sortRu(a.name, b.name));

      const objectAggs = new Map<string, Map<string, WorkTypeAgg>>();
      for (const o of objectsWithRecords) {
        objectAggs.set(o.id, buildAgg(monthRecords.filter((r) => r.object_id === o.id)));
      }

      const grandTotal = monthRecords.reduce(
        (s, r) => s + r.items.reduce((a, i) => a + itemQty(i) * i.price, 0),
        0,
      );

      const wb = new ExcelJS.Workbook();
      wb.creator = "Учёт работ";
      wb.created = new Date();

      // ============ Листы по объектам ============
      for (const obj of objectsWithRecords) {
        const agg = objectAggs.get(obj.id)!;
        const rows = [...agg.values()].sort((a, b) => sortRu(a.name, b.name));
        const objTotal = rows.reduce(
          (s, r) => s + r.perDay.reduce((a, q) => a + q, 0) * r.price,
          0,
        );

        const sheetName = obj.name.slice(0, 31).replace(/[[\]*/\\?:]/g, " ");
        const sheet = wb.addWorksheet(sheetName || `Объект ${obj.id}`, {
          views: [{ state: "frozen", ySplit: 4, xSplit: 4, showGridLines: false }],
        });
        const nCols = 4 + daysInMonth + 3; // №, Вид работ, Ед.изм., Цена, дни..., Итого объём, Итого сумма, Кто подал
        sheet.columns = [
          { width: 5 },
          { width: 38 },
          { width: 9 },
          { width: 11 },
          ...dayCols.map(() => ({ width: 5 })),
          { width: 13 },
          { width: 13 },
          { width: 22 },
        ];

        const titleRow = sheet.addRow([`УЧЁТ РАБОТ ПО ОБЪЕКТУ: ${obj.name.toUpperCase()}`]);
        sheet.mergeCells(titleRow.number, 1, titleRow.number, nCols);
        titleRow.height = 30;
        titleRow.getCell(1).font = {
          name: "Calibri",
          size: 14,
          bold: true,
          color: { argb: WHITE },
        };
        titleRow.getCell(1).fill = fill(ORANGE);
        titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

        const subRow = sheet.addRow([
          `Месяц: ${monthLabel}  |  Видов работ: ${rows.length}  |  Итого за месяц: ${money(objTotal)}`,
        ]);
        sheet.mergeCells(subRow.number, 1, subRow.number, nCols);
        subRow.getCell(1).font = { name: "Calibri", size: 11, color: { argb: GRAY_TXT } };
        subRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

        sheet.addRow([]);

        const headVals = [
          "№",
          "Вид работ",
          "Ед. изм.",
          "Цена, руб./ед.",
          ...dayCols.map((d) => String(d)),
          "Итого\nобъём",
          "Итого\nсумма, руб.",
          "Кто подал",
        ];
        const headRow = sheet.addRow(headVals);
        headRow.height = 26;
        headRow.eachCell((cell) => {
          cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
          cell.fill = fill(NAVY);
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = border;
        });

        rows.forEach((wt, idx) => {
          const totalQty = wt.perDay.reduce((a, q) => a + q, 0);
          const totalSum = Math.round(totalQty * wt.price);
          const submitter = [...wt.submitters].join(", ");
          const mainVals = [
            idx + 1,
            wt.name,
            wt.unit,
            wt.price,
            ...wt.perDay.map((q) => (q ? Math.round(q * 100) / 100 : "")),
            Math.round(totalQty * 100) / 100,
            totalSum,
            submitter,
          ];
          const mainRow = sheet.addRow(mainVals);
          mainRow.eachCell((cell, colNum) => {
            cell.border = border;
            if (colNum === 2) {
              cell.font = { name: "Calibri", size: 11, color: { argb: DARK_TXT } };
              cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
            } else if (colNum === 1 || colNum === 3) {
              cell.font = { name: "Calibri", size: 11, color: { argb: DARK_TXT } };
              cell.alignment = { vertical: "middle", horizontal: "center" };
            } else if (colNum === nCols) {
              cell.font = { name: "Calibri", size: 10.5, color: { argb: DARK_TXT } };
              cell.alignment = { vertical: "middle", horizontal: "left" };
            } else {
              cell.font = { name: "Calibri", size: 11, color: { argb: DARK_TXT } };
              cell.alignment = { vertical: "middle", horizontal: "right" };
            }
          });

          const empNames = [...wt.employees.keys()].sort(sortRu);
          for (const emp of empNames) {
            const arr = wt.employees.get(emp)!;
            const empTotal = arr.reduce((a, q) => a + q, 0);
            const subVals = [
              "",
              `      ↳ ${emp}`,
              "",
              "",
              ...arr.map((q) => (q ? Math.round(q * 100) / 100 : "")),
              Math.round(empTotal * 100) / 100,
              "",
              "",
            ];
            const subRow2 = sheet.addRow(subVals);
            subRow2.eachCell((cell, colNum) => {
              cell.border = border;
              cell.font = { name: "Calibri", size: 10.5, color: { argb: GRAY_TXT } };
              if (colNum === 2) cell.alignment = { vertical: "middle", horizontal: "left" };
              else cell.alignment = { vertical: "middle", horizontal: "right" };
            });
          }
        });

        const totalRow = sheet.addRow([]);
        const totalCell = totalRow.getCell(nCols - 1);
        totalCell.value = Math.round(objTotal);
        totalCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: DARK_TXT } };
        totalCell.fill = fill(LIGHT_ORANGE);
        totalCell.alignment = { vertical: "middle", horizontal: "right" };

        sheet.pageSetup = {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        };
      }

      // ============ Справочник (полный каталог видов работ) ============
      const allTypesSorted = [...workTypes].sort((a, b) => sortRu(a.name, b.name));
      const refSheet = wb.addWorksheet("Справочник", {
        views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
      });
      refSheet.columns = [{ width: 6 }, { width: 55 }, { width: 10 }, { width: 14 }];

      const refTitle = refSheet.addRow([
        `СПРАВОЧНИК ВИДОВ РАБОТ (${allTypesSorted.length} позиций)`,
      ]);
      refSheet.mergeCells(refTitle.number, 1, refTitle.number, 4);
      refTitle.height = 28;
      refTitle.getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
      refTitle.getCell(1).fill = fill(ORANGE);
      refTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const refHead = refSheet.addRow(["№", "Вид работ", "Ед. изм.", "Цена, руб./ед."]);
      refHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      allTypesSorted.forEach((wt, idx) => {
        const row = refSheet.addRow([idx + 1, wt.name, wt.unit, wt.price]);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(idx % 2 === 0 ? WHITE : LIGHT_BEIGE);
          cell.font = { name: "Calibri", size: 10.5, color: { argb: DARK_TXT } };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNum === 2 ? "left" : "center",
            wrapText: colNum === 2,
          };
        });
      });
      refSheet.pageSetup = {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      // ============ СВОДНАЯ (виды работ × объекты, ₽) ============
      const globalMap = new Map<
        string,
        { name: string; unit: string; byObject: Map<string, number> }
      >();
      for (const obj of objectsWithRecords) {
        const agg = objectAggs.get(obj.id)!;
        for (const wt of agg.values()) {
          const key = `${wt.name}||${wt.unit}`;
          let g = globalMap.get(key);
          if (!g) {
            g = { name: wt.name, unit: wt.unit, byObject: new Map() };
            globalMap.set(key, g);
          }
          const totalQty = wt.perDay.reduce((a, q) => a + q, 0);
          g.byObject.set(obj.id, Math.round(totalQty * wt.price));
        }
      }
      const globalRows = [...globalMap.values()].sort((a, b) => sortRu(a.name, b.name));

      const svCols = [
        "Вид работ",
        "Ед. изм.",
        ...objectsWithRecords.map((o) => o.name),
        "Итого, руб.",
        "% от общего",
      ];
      const svSheet = wb.addWorksheet("СВОДНАЯ", {
        views: [{ state: "frozen", ySplit: 4, xSplit: 2, showGridLines: false }],
      });
      svSheet.columns = [
        { width: 42 },
        { width: 9 },
        ...objectsWithRecords.map(() => ({ width: 16 })),
        { width: 14 },
        { width: 11 },
      ];

      const svTitle = svSheet.addRow([`СВОДНАЯ ТАБЛИЦА — ${monthLabel}`]);
      svSheet.mergeCells(svTitle.number, 1, svTitle.number, svCols.length);
      svTitle.height = 28;
      svTitle.getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
      svTitle.getCell(1).fill = fill(ORANGE);
      svTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const svSub = svSheet.addRow(["Суммы по каждому виду работ в разрезе объектов за месяц"]);
      svSheet.mergeCells(svSub.number, 1, svSub.number, svCols.length);
      svSub.getCell(1).font = { name: "Calibri", size: 11, color: { argb: GRAY_TXT } };
      svSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      svSheet.addRow([]);
      const svHead = svSheet.addRow(svCols);
      svHead.height = 26;
      svHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      globalRows.forEach((g, idx) => {
        const rowTotal = objectsWithRecords.reduce((s, o) => s + (g.byObject.get(o.id) ?? 0), 0);
        const pct = grandTotal ? `${((rowTotal / grandTotal) * 100).toFixed(1)}%` : "0.0%";
        const vals = [
          g.name,
          g.unit,
          ...objectsWithRecords.map((o) => g.byObject.get(o.id) ?? 0),
          rowTotal,
          pct,
        ];
        const row = svSheet.addRow(vals);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(idx % 2 === 0 ? WHITE : LIGHT_BLUE);
          cell.font = { name: "Calibri", size: 10, color: { argb: DARK_TXT }, bold: colNum === 1 };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNum === 1 ? "left" : colNum === 2 ? "center" : "right",
          };
        });
      });

      const svTotalRow = svSheet.addRow(["Итого:"]);
      svSheet.getCell(svTotalRow.number, svCols.length - 1).value = grandTotal;
      svTotalRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: DARK_TXT } };
        cell.fill = fill(LIGHT_ORANGE);
      });
      svSheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      // ============ СВОДНАЯ_ПО_ДНЯМ ============
      const dpSheet = wb.addWorksheet("СВОДНАЯ_ПО_ДНЯМ", {
        views: [{ state: "frozen", ySplit: 4, xSplit: 2, showGridLines: false }],
      });
      dpSheet.columns = [{ width: 22 }, { width: 14 }, ...dayCols.map(() => ({ width: 9 }))];

      const dpTitle = dpSheet.addRow([`СВОДНАЯ ПО ДНЯМ — ${monthLabel}`]);
      dpSheet.mergeCells(dpTitle.number, 1, dpTitle.number, 2 + daysInMonth);
      dpTitle.height = 28;
      dpTitle.getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
      dpTitle.getCell(1).fill = fill(ORANGE);
      dpTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const dpSub = dpSheet.addRow(["Объём и сумма по каждому объекту и дню месяца"]);
      dpSheet.mergeCells(dpSub.number, 1, dpSub.number, 2 + daysInMonth);
      dpSub.getCell(1).font = { name: "Calibri", size: 11, color: { argb: GRAY_TXT } };
      dpSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      dpSheet.addRow([]);
      const dpHead = dpSheet.addRow(["Объект", "Вид итога", ...dayCols.map((d) => String(d))]);
      dpHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = border;
      });

      objectsWithRecords.forEach((obj, idx) => {
        const agg = objectAggs.get(obj.id)!;
        const dayQty = new Array<number>(daysInMonth).fill(0);
        const daySum = new Array<number>(daysInMonth).fill(0);
        for (const wt of agg.values()) {
          wt.perDay.forEach((q, d) => {
            dayQty[d] = (dayQty[d] ?? 0) + q;
            daySum[d] = (daySum[d] ?? 0) + q * wt.price;
          });
        }
        const bandFill = idx % 2 === 0 ? WHITE : LIGHT_BLUE;

        const qtyRow = dpSheet.addRow([
          obj.name,
          "Объём (ед.)",
          ...dayQty.map((q) => (q ? Math.round(q * 100) / 100 : "")),
        ]);
        qtyRow.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(bandFill);
          cell.font = { name: "Calibri", size: 10, bold: colNum === 1, color: { argb: DARK_TXT } };
          cell.alignment = { vertical: "middle", horizontal: colNum <= 2 ? "left" : "right" };
        });

        const sumRow = dpSheet.addRow([
          "",
          "Сумма (руб.)",
          ...daySum.map((s) => (s ? Math.round(s) : "")),
        ]);
        sumRow.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(bandFill);
          cell.font = { name: "Calibri", size: 10, color: { argb: DARK_TXT } };
          cell.alignment = { vertical: "middle", horizontal: colNum <= 2 ? "left" : "right" };
        });
      });
      dpSheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      // ============ ИТОГО ============
      const itSheet = wb.addWorksheet("ИТОГО", {
        views: [{ showGridLines: false }],
      });
      itSheet.columns = [{ width: 6 }, { width: 42 }, { width: 13 }, { width: 14 }, { width: 11 }];

      const itTitle = itSheet.addRow([`ИТОГОВАЯ СВОДКА ЗА ${monthLabel.toUpperCase()}`]);
      itSheet.mergeCells(itTitle.number, 1, itTitle.number, 5);
      itTitle.height = 28;
      itTitle.getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
      itTitle.getCell(1).fill = fill(ORANGE);
      itTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      itSheet.addRow([]);

      const sec1 = itSheet.addRow(["1. ИТОГИ ПО ОБЪЕКТАМ"]);
      itSheet.mergeCells(sec1.number, 1, sec1.number, 5);
      sec1.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: NAVY } };

      const objHead = itSheet.addRow(["№", "Объект", "Видов работ", "Сумма, руб.", "% от всех"]);
      objHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      objectsWithRecords.forEach((obj, idx) => {
        const agg = objectAggs.get(obj.id)!;
        const sum = [...agg.values()].reduce(
          (s, wt) => s + wt.perDay.reduce((a, q) => a + q, 0) * wt.price,
          0,
        );
        const pct = grandTotal ? `${((sum / grandTotal) * 100).toFixed(1)}%` : "0.0%";
        const row = itSheet.addRow([idx + 1, obj.name, agg.size, Math.round(sum), pct]);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(idx % 2 === 0 ? WHITE : LIGHT_BLUE);
          cell.font = { name: "Calibri", size: 10.5, color: { argb: DARK_TXT } };
          cell.alignment = { vertical: "middle", horizontal: colNum === 2 ? "left" : "center" };
        });
      });

      const grandRow = itSheet.addRow([
        "",
        "ВСЕГО ПО ВСЕМ ОБЪЕКТАМ:",
        "",
        Math.round(grandTotal),
        "",
      ]);
      grandRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: DARK_TXT } };
        cell.fill = fill(LIGHT_ORANGE);
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });

      itSheet.addRow([]);

      const sec2 = itSheet.addRow(["2. ТОП-20 ВИДОВ РАБОТ (по суммарным затратам)"]);
      itSheet.mergeCells(sec2.number, 1, sec2.number, 5);
      sec2.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: NAVY } };

      const topHead = itSheet.addRow(["Ранг", "Вид работ", "Итого, руб.", "% от общего", ""]);
      topHead.eachCell((cell, colNum) => {
        if (colNum > 4) return;
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      const top20 = [...globalRows]
        .map((g) => ({
          name: g.name,
          total: objectsWithRecords.reduce((s, o) => s + (g.byObject.get(o.id) ?? 0), 0),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      top20.forEach((t, idx) => {
        const pct = grandTotal ? `${((t.total / grandTotal) * 100).toFixed(1)}%` : "0.0%";
        const row = itSheet.addRow([idx + 1, t.name, Math.round(t.total), pct]);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(idx % 2 === 0 ? WHITE : LIGHT_BLUE);
          cell.font = { name: "Calibri", size: 10.5, color: { argb: DARK_TXT } };
          cell.alignment = { vertical: "middle", horizontal: colNum === 2 ? "left" : "center" };
        });
      });
      itSheet.pageSetup = {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      // ============ По сотрудникам ============
      const empSheet = wb.addWorksheet("По сотрудникам", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
      });
      empSheet.columns = [
        { width: 26 },
        { width: 50 },
        { width: 13 },
        { width: 11 },
        { width: 13 },
      ];

      const empTitle = empSheet.addRow([`ВЫРАБОТКА ПО СОТРУДНИКАМ — ${monthLabel}`]);
      empSheet.mergeCells(empTitle.number, 1, empTitle.number, 5);
      empTitle.height = 28;
      empTitle.getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
      empTitle.getCell(1).fill = fill(ORANGE);
      empTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const empSub = empSheet.addRow([
        "Сумма по всем объектам за месяц, отсортировано по убыванию",
      ]);
      empSheet.mergeCells(empSub.number, 1, empSub.number, 5);
      empSub.getCell(1).font = { name: "Calibri", size: 11, color: { argb: GRAY_TXT } };
      empSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      empSheet.addRow([]);

      type EmpWorkType = { name: string; unit: string; qty: number; sum: number };
      const empMap = new Map<string, Map<string, EmpWorkType>>();
      for (const obj of objectsWithRecords) {
        const agg = objectAggs.get(obj.id)!;
        for (const wt of agg.values()) {
          for (const [emp, arr] of wt.employees) {
            const empQty = arr.reduce((a, q) => a + q, 0);
            if (!empQty) continue;
            let types = empMap.get(emp);
            if (!types) {
              types = new Map();
              empMap.set(emp, types);
            }
            const key = `${wt.name}||${wt.unit}`;
            const existing = types.get(key);
            if (existing) {
              existing.qty += empQty;
              existing.sum += empQty * wt.price;
            } else {
              types.set(key, { name: wt.name, unit: wt.unit, qty: empQty, sum: empQty * wt.price });
            }
          }
        }
      }

      const empList = [...empMap.entries()]
        .map(([emp, types]) => ({
          emp,
          types: [...types.values()].sort((a, b) => sortRu(a.name, b.name)),
          total: [...types.values()].reduce((s, t) => s + t.sum, 0),
        }))
        .sort((a, b) => b.total - a.total);

      let empGrand = 0;
      for (const e of empList) {
        const empHeadRow = empSheet.addRow([`${e.emp} — итого ${money(e.total)}`]);
        empSheet.mergeCells(empHeadRow.number, 1, empHeadRow.number, 5);
        empHeadRow.getCell(1).font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: NAVY },
        };

        const subHead = empSheet.addRow([
          "Сотрудник",
          "Вид работ",
          "Ед. изм.",
          "Объём",
          "Сумма, руб.",
        ]);
        subHead.eachCell((cell) => {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
          cell.fill = fill(NAVY);
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = border;
        });

        e.types.forEach((t) => {
          const row = empSheet.addRow([
            "",
            t.name,
            t.unit,
            Math.round(t.qty * 100) / 100,
            Math.round(t.sum),
          ]);
          row.eachCell((cell, colNum) => {
            cell.border = border;
            cell.font = { name: "Calibri", size: 10, color: { argb: DARK_TXT } };
            cell.alignment = {
              vertical: "middle",
              horizontal: colNum === 2 ? "left" : colNum === 3 ? "center" : "right",
            };
          });
        });

        empSheet.addRow([]);
        empGrand += e.total;
      }

      const empTotalRow = empSheet.addRow(["", "", "", "Итого по всем:", Math.round(empGrand)]);
      empTotalRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: DARK_TXT } };
        cell.fill = fill(LIGHT_ORANGE);
      });
      empSheet.pageSetup = {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `svod-${svodYear}-${String(svodMonth + 1).padStart(2, "0")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSvodBusy(false);
    }
  };

  const submitters = Array.from(new Set(records.map((r) => r.created_by))).sort();

  const periodRecords = records.filter((r) => {
    const d = parseDate(r.date);
    if (period === "Месяц") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    const start = new Date(now);
    const dow = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  });

  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - (period === "Месяц" ? 31 : 7));
  const recentlyActiveObjectIds = new Set(
    records.filter((r) => parseDate(r.date) >= recentCutoff).map((r) => r.object_id),
  );

  const perObject = objects
    .filter((o) => recentlyActiveObjectIds.has(o.id))
    .map((o) => ({ ...o, count: periodRecords.filter((r) => r.object_id === o.id).length }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...perObject.map((p) => p.count));
  const volume = periodRecords.reduce((s, r) => s + r.items.reduce((a, i) => a + i.qty, 0), 0);
  const activeEmployees = new Set(
    periodRecords.flatMap((r) =>
      r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees,
    ),
  ).size;

  const statsInRange = useMemo(() => {
    return records.filter((r) => {
      const d = parseDate(r.date);
      if (statsFrom) {
        const from = new Date(statsFrom);
        from.setHours(0, 0, 0, 0);
        if (d < from) return false;
      }
      if (statsTo) {
        const to = new Date(statsTo);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      return true;
    });
  }, [records, statsFrom, statsTo]);

  const statsRows = useMemo(
    () =>
      grouping === "employees"
        ? buildEmployeeStats(statsInRange)
        : buildObjectStats(statsInRange, objects),
    [statsInRange, grouping, objects],
  );
  const statsMaxPositions = Math.max(1, ...statsRows.map((r) => r.positions));
  const statsTotalPositions = statsRows.reduce((s, r) => s + r.positions, 0);

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Отчёты" />

      <div className="mt-4 flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "bg-surface text-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:gap-4">
        <Metric
          value={String(periodRecords.length)}
          label={period === "Месяц" ? "записей за месяц" : "записей за неделю"}
          accent
        />
        <Metric
          value={String(perObject.filter((o) => o.count > 0).length)}
          label="активных объектов"
        />
        <Metric value={`${Math.round(volume)}`} label="суммарный объём (ед.)" />
        <Metric value={String(activeEmployees)} label="сотрудников вышло" />
      </div>

      <section className="mt-6">
        <h2 className="label-caps">По объектам</h2>
        <div className="mt-3 space-y-3">
          {perObject.map((o) => (
            <div key={o.id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm">{o.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(o.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right font-mono text-sm font-bold">{o.count}</span>
            </div>
          ))}
          {perObject.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Нет объектов с записями за последние {period === "Месяц" ? "31 день" : "7 дней"}.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Подробные отчёты</h2>

        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Статистика за период</h3>
            <button
              type="button"
              onClick={() => setStatsOpen((v) => !v)}
              className="shrink-0 text-sm font-semibold text-primary"
            >
              {statsOpen ? "Свернуть статистику" : "Показать статистику"}
            </button>
          </div>

          {statsOpen && (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 sm:w-64">
                  {(["employees", "objects"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrouping(g)}
                      className={cn(
                        "rounded-lg py-2 text-xs font-semibold",
                        grouping === g ? "bg-primary text-primary-foreground" : "text-foreground",
                      )}
                    >
                      {g === "employees" ? "Сотрудники" : "Объекты"}
                    </button>
                  ))}
                </div>
                <div>
                  <FieldLabel>С даты</FieldLabel>
                  <input
                    type="date"
                    value={statsFrom}
                    onChange={(e) => setStatsFrom(e.target.value)}
                    className="mt-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>По дату</FieldLabel>
                  <input
                    type="date"
                    value={statsTo}
                    onChange={(e) => setStatsTo(e.target.value)}
                    className="mt-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    Записей за период
                  </p>
                  <p className="mt-1 text-2xl font-bold">{statsInRange.length}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    Позиций всего
                  </p>
                  <p className="mt-1 text-2xl font-bold">{statsTotalPositions}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    Больше всех сделал
                  </p>
                  <p className="mt-1 truncate text-lg font-bold">{statsRows[0]?.label ?? "—"}</p>
                </div>
              </div>

              <p className="mt-4 label-caps">
                {grouping === "employees" ? "По сотрудникам" : "По объектам"} — позиций за период
              </p>
              <div className="mt-2 divide-y divide-border">
                {statsRows.map((row, i) => {
                  const expanded = expandedStatsKey === row.key;
                  return (
                    <div key={row.key} className="py-2">
                      <button
                        type="button"
                        onClick={() => setExpandedStatsKey(expanded ? null : row.key)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
                        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block sm:w-40">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(row.positions / statsMaxPositions) * 100}%` }}
                          />
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs font-bold">
                          {row.positions} поз.
                        </span>
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                      {expanded && (
                        <div className="mt-2 ml-8 space-y-1.5">
                          {row.items.map((it) => (
                            <div
                              key={`${it.name}-${it.unit}`}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                            >
                              <span className="text-muted-foreground break-words">{it.name}</span>
                              <span className="shrink-0 font-mono font-semibold tabular-nums text-primary">
                                — {formatQty(it.qty)} {it.unit}
                              </span>
                            </div>
                          ))}
                          {isAdmin && (
                            <p className="pt-1 text-xs text-muted-foreground">
                              Сумма: {Math.round(row.totalValue).toLocaleString("ru-RU")} ₽
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {statsRows.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground">
                    Нет данных за выбранный период.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Отчёт по объекту / сотруднику / подавшему</h3>
            <div className="mt-3 space-y-2">
              <select
                value={rObject}
                onChange={(e) => setRObject(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все объекты</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <select
                value={rEmployee}
                onChange={(e) => setREmployee(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все сотрудники</option>
                {employees.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <select
                value={rSubmitter}
                onChange={(e) => setRSubmitter(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Все подавшие</option>
                {submitters.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>С даты</FieldLabel>
                  <input
                    type="date"
                    value={rFrom}
                    onChange={(e) => setRFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>По дату</FieldLabel>
                  <input
                    type="date"
                    value={rTo}
                    onChange={(e) => setRTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Link
                to="/reports/detail"
                search={{
                  object: rObject,
                  employee: rEmployee,
                  submitter: rSubmitter,
                  from: rFrom,
                  to: rTo,
                  apply: "1",
                }}
                className="block rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
              >
                Открыть подробный отчёт
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Месячный свод по всем объектам</h3>
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Месяц</FieldLabel>
                  <select
                    value={svodMonth}
                    onChange={(e) => setSvodMonth(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {monthNames.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Год</FieldLabel>
                  <select
                    value={svodYear}
                    onChange={(e) => setSvodYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {svodYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                disabled={svodBusy}
                onClick={() => void exportMonthlySummary()}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-default disabled:opacity-60 cursor-pointer"
              >
                {svodBusy ? "Формирование..." : "Скачать Excel"}
              </button>
            </div>
          </div>
        </div>

        <Link to="/reports/all" className="mt-4 inline-block text-sm font-semibold text-primary">
          Все записи — таблица с фильтрами →
        </Link>
      </section>
    </AppShell>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className={cn("font-mono text-3xl font-bold", accent && "text-primary")}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
