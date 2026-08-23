import type { WorkRequest } from "@/data/mock";

export type NotificationKind = "request" | "comment" | "deleted";

export type NotificationItem = {
  id: string;
  requestId: string;
  kind: NotificationKind;
  author: string;
  title: string;
  text: string;
  date: string;
  time: string;
};

/**
 * Строит единый список уведомлений (новые заявки, сообщения в переписке,
 * удалённые заявки) из массива заявок. Используется и для баннеров/звука, и
 * для счётчика непрочитанных, и для страницы "Уведомления" — чтобы логика
 * везде была одинаковой.
 */
export function buildNotificationItems(
  requests: WorkRequest[],
  isForeman: boolean,
  currentUserFullName: string,
  opts: { includeRequests?: boolean; includeMessages?: boolean } = {},
): NotificationItem[] {
  const { includeRequests = true, includeMessages = true } = opts;
  const visible = isForeman ? requests.filter((r) => r.author === currentUserFullName) : requests;

  const items: NotificationItem[] = [];
  for (const r of visible) {
    if (includeRequests) {
      items.push({
        id: `${r.id}-new`,
        requestId: r.id,
        kind: "request",
        author: r.author,
        title: "Новая заявка на вид работ",
        text: r.requested_text,
        date: r.created_at,
        // Время подачи самой заявки, а не первого сообщения в переписке —
        // иначе у только что созданной заявки (без сообщений) время не
        // отображалось и сортировка по убыванию даты/времени ломалась.
        time: r.created_time || r.comments[0]?.time || "—",
      });
      if (r.status === "deleted") {
        items.push({
          id: `${r.id}-deleted`,
          requestId: r.id,
          kind: "deleted",
          author: r.author,
          title: "Заявка удалена автором",
          text: r.requested_text,
          date: r.created_at,
          time: "—",
        });
      }
    }
    if (includeMessages) {
      for (const c of r.comments) {
        items.push({
          id: c.id,
          requestId: r.id,
          kind: "comment",
          author: c.author,
          title: `Сообщение по заявке: ${r.requested_text}`,
          text: c.text,
          // Дата самого сообщения, а не дата создания заявки — иначе вся
          // переписка "залипает" на дате заявки и сортировка по убыванию
          // даты/времени в уведомлениях ломается. Фолбэк на r.created_at
          // остаётся на случай старых моковых данных без даты у комментария.
          date: c.date ?? r.created_at,
          time: c.time,
        });
      }
    }
  }
  return items;
}

export function sortNotificationItems(items: NotificationItem[]): NotificationItem[] {
  const key = (d: string, t: string) => {
    const [dd, mm, yyyy] = d.split(".");
    return `${yyyy}-${mm}-${dd} ${t}`;
  };
  return [...items].sort((a, b) => key(b.date, b.time).localeCompare(key(a.date, a.time)));
}

/**
 * Все id уведомлений, относящиеся к одной заявке (сама заявка, её удаление
 * автором, если было, и все сообщения переписки) — чтобы при открытии
 * заявки можно было одним вызовом пометить прочитанным всё, что с ней связано.
 */
export function notificationIdsForRequest(r: WorkRequest): string[] {
  const ids = [`${r.id}-new`];
  if (r.status === "deleted") ids.push(`${r.id}-deleted`);
  for (const c of r.comments) ids.push(c.id);
  return ids;
}
