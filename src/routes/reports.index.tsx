import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { itemQty } from "@/lib/record-utils";
import { roleLabels } from "@/data/mock";
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

function ReportsPage() {
  const { records, objects, role, employees } = useApp();
  const [period, setPeriod] = useState<(typeof periods)[number]>("Эта неделя");
  const [grouping, setGrouping] = useState<"employees" | "objects">("employees");
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
      const LIGHT_BLUE = "FFEFF3F8";
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

      const wb = new ExcelJS.Workbook();
      wb.creator = "Учёт работ";
      wb.created = new Date();

      // ---------- Лист 1: свод по объектам ----------
      const objCols = isAdmin
        ? ["Объект", "Адрес", "Записей", "Объём (ед.)", "Сумма, ₽"]
        : ["Объект", "Адрес", "Записей", "Объём (ед.)"];

      const perObject = objects
        .map((o) => {
          const recs = monthRecords.filter((r) => r.object_id === o.id);
          const qty = recs.reduce((s, r) => s + r.items.reduce((a, i) => a + itemQty(i), 0), 0);
          const total = recs.reduce(
            (s, r) => s + r.items.reduce((a, i) => a + itemQty(i) * i.price, 0),
            0,
          );
          return { name: o.name, address: o.address, count: recs.length, qty, total };
        })
        .filter((o) => o.count > 0)
        .sort((a, b) => b.count - a.count);

      const objSheet = wb.addWorksheet("По объектам", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
      });
      objSheet.columns = [
        { width: 34 },
        { width: 34 },
        { width: 11 },
        { width: 14 },
        ...(isAdmin ? [{ width: 15 }] : []),
      ];

      const objTitle = objSheet.addRow([
        `СВОД ПО ОБЪЕКТАМ — ${(monthNames[svodMonth] ?? "").toUpperCase()} ${svodYear}`,
      ]);
      objSheet.mergeCells(objTitle.number, 1, objTitle.number, objCols.length);
      objTitle.height = 30;
      objTitle.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
      objTitle.getCell(1).fill = fill(NAVY);
      objTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const objSub = objSheet.addRow([
        `Объектов с записями: ${perObject.length}  |  Всего записей: ${monthRecords.length}`,
      ]);
      objSheet.mergeCells(objSub.number, 1, objSub.number, objCols.length);
      objSub.height = 18;
      objSub.getCell(1).font = {
        name: "Calibri",
        size: 10.5,
        italic: true,
        bold: true,
        color: { argb: "FF5B5650" },
      };
      objSub.getCell(1).fill = fill(ORANGE);
      objSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      objSheet.addRow([]);
      const objHead = objSheet.addRow(objCols);
      objHead.height = 24;
      objHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      perObject.forEach((o, idx) => {
        const rowFill = idx % 2 === 0 ? WHITE : LIGHT_BLUE;
        const vals = isAdmin
          ? [o.name, o.address, o.count, Math.round(o.qty * 100) / 100, Math.round(o.total)]
          : [o.name, o.address, o.count, Math.round(o.qty * 100) / 100];
        const row = objSheet.addRow(vals);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(rowFill);
          cell.font = {
            name: "Calibri",
            size: 10,
            color: { argb: "FF1F2933" },
            bold: colNum === 1,
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNum <= 2 ? "left" : "right",
            wrapText: colNum === 2,
          };
          if (colNum === 5) cell.numFmt = '#,##0" ₽"';
        });
      });

      objSheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      // ---------- Лист 2: свод по видам работ ----------
      type WtRow = { name: string; unit: string; qty: number; count: number; total: number };
      const wtMap = new Map<string, WtRow>();
      for (const r of monthRecords) {
        for (const item of r.items) {
          const key = `${item.name}||${item.unit}`;
          const prev = wtMap.get(key) ?? {
            name: item.name,
            unit: item.unit,
            qty: 0,
            count: 0,
            total: 0,
          };
          prev.qty += itemQty(item);
          prev.total += itemQty(item) * item.price;
          prev.count += 1;
          wtMap.set(key, prev);
        }
      }
      const wtRows = [...wtMap.values()].sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name),
      );

      const wtCols = isAdmin
        ? ["Вид работы", "Ед.", "Объём", "Записей", "Сумма, ₽"]
        : ["Вид работы", "Ед.", "Объём", "Записей"];
      const wtSheet = wb.addWorksheet("По видам работ", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
      });
      wtSheet.columns = [
        { width: 46 },
        { width: 9 },
        { width: 14 },
        { width: 11 },
        ...(isAdmin ? [{ width: 15 }] : []),
      ];

      const wtTitle = wtSheet.addRow([
        `СВОД ПО ВИДАМ РАБОТ — ${(monthNames[svodMonth] ?? "").toUpperCase()} ${svodYear}`,
      ]);
      wtSheet.mergeCells(wtTitle.number, 1, wtTitle.number, wtCols.length);
      wtTitle.height = 28;
      wtTitle.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
      wtTitle.getCell(1).fill = fill(NAVY);
      wtTitle.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const wtSub = wtSheet.addRow([
        `Видов работ: ${wtRows.length}  |  Всего записей: ${monthRecords.length}`,
      ]);
      wtSheet.mergeCells(wtSub.number, 1, wtSub.number, wtCols.length);
      wtSub.height = 18;
      wtSub.getCell(1).font = {
        name: "Calibri",
        size: 10.5,
        italic: true,
        bold: true,
        color: { argb: "FF5B5650" },
      };
      wtSub.getCell(1).fill = fill(ORANGE);
      wtSub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      wtSheet.addRow([]);
      const wtHead = wtSheet.addRow(wtCols);
      wtHead.height = 24;
      wtHead.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });

      wtRows.forEach((w, idx) => {
        const rowFill = idx % 2 === 0 ? WHITE : LIGHT_BLUE;
        const vals = isAdmin
          ? [w.name, w.unit, Math.round(w.qty * 100) / 100, w.count, Math.round(w.total)]
          : [w.name, w.unit, Math.round(w.qty * 100) / 100, w.count];
        const row = wtSheet.addRow(vals);
        row.eachCell((cell, colNum) => {
          cell.border = border;
          cell.fill = fill(rowFill);
          cell.font = {
            name: "Calibri",
            size: 10,
            color: { argb: "FF1F2933" },
            bold: colNum === 1,
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNum === 1 ? "left" : colNum === 2 ? "center" : "right",
          };
          if (colNum === 3) cell.numFmt = "#,##0.###";
          if (colNum === 5) cell.numFmt = '#,##0" ₽"';
        });
      });

      wtSheet.pageSetup = {
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

  const perObject = objects
    .map((o) => ({ ...o, count: periodRecords.filter((r) => r.object_id === o.id).length }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...perObject.map((p) => p.count));
  const volume = periodRecords.reduce((s, r) => s + r.items.reduce((a, i) => a + i.qty, 0), 0);
  const activeEmployees = new Set(
    periodRecords.flatMap((r) =>
      r.execution_type === "brigade" ? (r.brigade_members ?? []) : r.employees,
    ),
  ).size;

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
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Подробные отчёты</h2>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Статистика за период</h3>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
              {(["employees", "objects"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGrouping(g)}
                  className={cn(
                    "rounded-lg py-2 text-xs font-semibold",
                    grouping === g ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {g === "employees" ? "По сотрудникам" : "По объектам"}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <input
                type="date"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>

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
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
