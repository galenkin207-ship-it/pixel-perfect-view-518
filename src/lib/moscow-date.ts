// Даты и время по Москве — как на бэкенде (moscowToday в
// uchet-backend/src/object-photo-source.js), а не по часовому поясу устройства.

const MSK = "Europe/Moscow";

const isoDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: MSK });
const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: MSK,
});

/** Сегодняшняя дата по Москве, yyyy-mm-dd. */
export function moscowToday(): string {
  return isoDateFmt.format(new Date());
}

/** Дата момента времени (ISO timestamp) по Москве, yyyy-mm-dd. */
export function moscowDateOf(iso: string): string {
  return iso ? isoDateFmt.format(new Date(iso)) : "";
}

/** ЧЧ:ММ по Москве. */
export function formatMoscowTime(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : "";
}

/** Сдвиг даты yyyy-mm-dd на days календарных дней. */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd → dd.mm.yyyy */
export function isoToRuDate(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : isoDate;
}
