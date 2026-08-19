import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Image as ImageIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { useIsMobile } from "@/hooks/use-mobile";
import { allocationsFor, itemQty, recordTotal } from "@/lib/record-utils";
import { cn } from "@/lib/utils";
import type { WorkRecord } from "@/data/mock";
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
        content: "Фильтры по сотруднику, объекту и подавшему, раскрытие день → запись → сотрудники.",
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
    return allocs.map((a) => ({ employee: a.employee, qty: a.qty, unit: item.unit, item: item.name }));
  });
}

function ReportDetailPage() {
  const { records, objects, employees, role } = useApp();
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
    Boolean(initial.employee || initial.objectId || initial.submitter || initial.from || initial.to);

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

  const submitters = useMemo(
    () => Array.from(new Set(records.map((r) => r.created_by))).sort(),
    [records],
  );

  const days: DayGroup[] = useMemo(() => {
    if (!applied) return [];
    const filtered = records.filter((r) => {
      if (applied.objectId && r.object_id !== applied.objectId) return false;
      if (applied.submitter && r.created_by !== applied.submitter) return false;
      if (applied.employee && !crewOf(r).includes(applied.employee)) return false;
      const t = parseDate(r.date).getTime();
      if (applied.from && t < new Date(applied.from).getTime()) return false;
      if (applied.to && t > new Date(applied.to).getTime()) return false;
      return true;
    });
    const map = new Map<string, WorkRecord[]>();
    for (const r of filtered) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    const list = [...map.entries()].map(([date, recs]) => ({
      date,
      records: recs,
      total: recs.reduce((s, r) => s + recordTotal(r.items), 0),
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
        for (const item of r.items) {
          const key = `${item.name}||${item.unit}`;
          const prev = map.get(key) ?? { name: item.name, unit: item.unit, qty: 0, total: 0, count: 0 };
          prev.qty += itemQty(item);
          prev.total += itemQty(item) * item.price;
          prev.count += 1;
          map.set(key, prev);
        }
      }
    }
    return [...map.values()]
      .map((s) => ({ ...s, qty: Math.round(s.qty * 100) / 100 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [days]);

  const exportExcel = () => {
    const detail: (string | number)[][] = [
      ["Дата", "День", "Время", "Вид работы", "Сотрудник", "Объём", "Ед.", "Кто подал", ...(isAdmin ? ["Сумма, ₽"] : [])],
    ];
    for (const day of days) {
      for (const r of day.records) {
        for (const item of r.items) {
          const crew = crewOf(r);
          const allocs = item.allocations?.length ? item.allocations : allocationsFor(item, crew);
          for (const a of allocs) {
            detail.push([
              day.date,
              weekday(day.date),
              r.time,
              item.name,
              a.employee,
              a.qty,
              item.unit,
              r.created_by,
              ...(isAdmin ? [Math.round(a.qty * item.price)] : []),
            ]);
          }
        }
      }
    }
    const summarySheet: (string | number)[][] = [
      ["Вид работы", "Ед.", "Всего объём", "Записей", ...(isAdmin ? ["Сумма, ₽"] : [])],
      ...summary.map((s) => [s.name, s.unit, s.qty, s.count, ...(isAdmin ? [Math.round(s.total)] : [])]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), "Детализация");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summarySheet), "Сводная");
    XLSX.writeFile(wb, `otchet-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  };

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const activeDay = days.find((d) => d.date === mobileDay);
  const activeRecord = activeDay?.records.find((r) => r.id === mobileRecord);

  // ---------- мобильные экраны ----------
  if (isMobile && applied && activeRecord) {
    return (
      <AppShell>
        <MobileHeader title={`Запись ${activeRecord.time}`} onBack={() => setMobileRecord(null)} />
        <RecordDetailBlock record={activeRecord} isAdmin={isAdmin} />
      </AppShell>
    );
  }

  if (isMobile && applied && activeDay) {
    return (
      <AppShell>
        <MobileHeader
          title={`${weekday(activeDay.date)}, ${activeDay.date}`}
          onBack={() => setMobileDay(null)}
        />
        <div className="mt-3 space-y-2">
          {activeDay.records.map((r) => (
            <button
              key={r.id}
              onClick={() => setMobileRecord(r.id)}
              className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <RecordSummary record={r} isAdmin={isAdmin} />
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Отчёт по объекту / сотруднику / подавшему" />

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel>Сотрудник</FieldLabel>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— все сотрудники —</option>
              {employees.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Объект</FieldLabel>
            <input
              list="report-objects"
              value={objects.find((o) => o.id === objectId)?.name ?? ""}
              onChange={(e) =>
                setObjectId(objects.find((o) => o.name === e.target.value)?.id ?? "")
              }
              placeholder="— все объекты —"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <datalist id="report-objects">
              {objects.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </div>
          <div>
            <FieldLabel>Подавший</FieldLabel>
            <select
              value={submitter}
              onChange={(e) => setSubmitter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— все подавшие —</option>
              {submitters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>С даты</FieldLabel>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <FieldLabel>По дату</FieldLabel>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
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
        <p className="mt-3 text-xs text-muted-foreground">
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
              return (
                <div key={day.date} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button
                    onClick={() =>
                      isMobile
                        ? setMobileDay(day.date)
                        : toggle(openDays, setOpenDays, day.date)
                    }
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    {isMobile ? (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    )}
                    <span className="flex-1 font-semibold">
                      {weekday(day.date)}, {day.date}
                    </span>
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
                    <div className="space-y-2 border-t border-border bg-surface/40 p-3">
                      {day.records.map((r) => {
                        const rOpen = openRecords.includes(r.id);
                        return (
                          <div key={r.id} className="rounded-xl border border-border bg-card">
                            <button
                              onClick={() => toggle(openRecords, setOpenRecords, r.id)}
                              className="flex w-full items-start gap-3 p-4 text-left"
                            >
                              <ChevronDown
                                className={cn(
                                  "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                                  rOpen && "rotate-180",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <RecordSummary record={r} isAdmin={isAdmin} />
                              </div>
                            </button>
                            {rOpen && (
                              <div className="border-t border-border p-4">
                                <RecordDetailBlock record={r} isAdmin={isAdmin} nested />
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
                      <tr key={`${s.name}-${s.unit}`} className="border-t border-border">
                        <td className="px-4 py-2.5 font-medium break-words">{s.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                          {s.qty} {s.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{s.count}</td>
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
    <div className="flex items-center gap-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
      >
        <ChevronLeft className="size-4" />
        Назад
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
    </div>
  );
}

function RecordSummary({ record, isAdmin }: { record: WorkRecord; isAdmin: boolean }) {
  const crew = crewOf(record);
  return (
    <div className="space-y-1.5">
      {record.items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex min-w-0 flex-1 items-start gap-1.5 font-semibold break-words whitespace-normal">
            {item.name}
            {record.photos.length > 0 && (
              <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
          </span>
          <span className="font-mono text-sm font-bold">
            {itemQty(item)} {item.unit}
          </span>
          {isAdmin && (
            <span className="font-mono text-sm font-bold text-primary">
              {money(itemQty(item) * item.price)}
            </span>
          )}
        </div>
      ))}
      <p className="text-sm break-words text-muted-foreground">
        Сотрудники: <span className="text-foreground">{crew.join(", ") || "—"}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Кто подал: <span className="text-foreground">{record.created_by}</span>
      </p>
    </div>
  );
}

function RecordDetailBlock({
  record,
  isAdmin,
  nested,
}: {
  record: WorkRecord;
  isAdmin: boolean;
  nested?: boolean;
}) {
  const [photosOpen, setPhotosOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const rows = breakdownOf(record);

  return (
    <div className={cn(!nested && "mt-4 rounded-2xl border border-border bg-card p-4")}>
      {!nested && <RecordSummary record={record} isAdmin={isAdmin} />}

      <h3 className="label-caps mt-4">Кто и сколько сделал</h3>
      <div className="mt-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-0"
          >
            <div className="min-w-0">
              <button className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                {row.employee}
              </button>
              <p className="text-xs break-words text-muted-foreground">{row.item}</p>
            </div>
            <span className="font-mono text-sm font-bold">
              {row.qty} {row.unit}
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Нет разбивки</p>}
      </div>

      {isAdmin && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm font-semibold">Итого по записи</span>
          <span className="font-mono font-bold text-primary">{money(recordTotal(record.items))}</span>
        </div>
      )}

      <button
        onClick={() => setPhotosOpen((v) => !v)}
        className="mt-3 flex w-full items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm font-semibold"
      >
        <ChevronDown className={cn("size-4 transition-transform", photosOpen && "rotate-180")} />
        Фото ({record.photos.length})
      </button>
      {photosOpen && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {record.photos.map((p) => (
            <button
              key={p}
              onClick={() => setPreview(p)}
              className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-xs text-muted-foreground"
            >
              {p}
            </button>
          ))}
          {record.photos.length === 0 && (
            <p className="text-sm text-muted-foreground">Фотографий нет</p>
          )}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <div className="relative flex aspect-video w-full max-w-3xl items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            {preview}
            <button
              onClick={() => setPreview(null)}
              aria-label="Закрыть"
              className="absolute top-3 right-3"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
