import type { WorkRequest } from "@/data/mock";

export type NotificationKind = "request" | "comment" | "deleted" | "approved" | "rejected";

export type NotificationItem = {
  id: string;
  requestId: string;
  kind: NotificationKind;
  author: string;
  // id автора события — известен для "request"/"deleted"/"comment" (у них
  // есть author_user_id с бэкенда). Для "approved"/"rejected" — не известен:
  // resolved_by/rejected_by на бэкенде хранят только ФИО решившего заявку,
  // без user_id (отдельная колонка для этого пока не заведена), поэтому для
  // этих двух видов сравнение "моё/чужое" по-прежнему идёт по ФИО.
  authorUserId?: string;
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
  currentUser: { id: string; full_name: string },
  opts: { includeRequests?: boolean; includeMessages?: boolean } = {},
): NotificationItem[] {
  const { includeRequests = true, includeMessages = true } = opts;
  const isMine = (authorUserId: string | undefined, author: string) =>
    authorUserId != null ? authorUserId === currentUser.id : author === currentUser.full_name;
  const visible = isForeman
    ? requests.filter((r) => isMine(r.author_user_id, r.author))
    : requests;

  const items: NotificationItem[] = [];
  for (const r of visible) {
    if (includeRequests) {
      items.push({
        id: `${r.id}-new`,
        requestId: r.id,
        kind: "request",
        author: r.author,
        ...(r.author_user_id != null ? { authorUserId: r.author_user_id } : {}),
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
          ...(r.author_user_id != null ? { authorUserId: r.author_user_id } : {}),
          title: "Заявка удалена автором",
          text: r.requested_text,
          date: r.created_at,
          time: "—",
        });
      }
      // Одобрение/отклонение — отдельное уведомление для автора заявки.
      // Автором события ставим того, кто принял решение (куратора/админа), а
      // не автора заявки: так фильтр "непрочитанные" сработает правильно —
      // сам принявший решение не увидит это как непрочитанное у себя, а вот
      // автор заявки (обычно другой человек) увидит.
      if (r.status === "approved") {
        items.push({
          id: `${r.id}-approved`,
          requestId: r.id,
          kind: "approved",
          author: r.resolved_by || r.author,
          title: "Заявка одобрена",
          text: r.requested_text,
          date: r.resolved_date ?? r.created_at,
          time: r.resolved_time ?? "—",
        });
      }
      if (r.status === "rejected") {
        items.push({
          id: `${r.id}-rejected`,
          requestId: r.id,
          kind: "rejected",
          author: r.rejected_by || r.author,
          title: "Заявка отклонена",
          text: r.reject_reason || r.requested_text,
          date: r.rejected_date ?? r.created_at,
          time: r.rejected_time ?? "—",
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
          ...(c.author_user_id != null ? { authorUserId: c.author_user_id } : {}),
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
  // Свои собственные действия (свои сообщения, свою поданную заявку, своё
  // одобрение/отклонение чужой заявки, удаление своей заявки) в уведомления
  // не включаем вообще — это не уведомление, а то, что человек сам только что
  // сделал. Раньше такие события всё равно попадали в список на странице
  // "Уведомления" (просто не считались непрочитанными), из-за чего
  // администратор/куратор видел там свои же отправленные сообщения.
  return items.filter((item) => !isMine(item.authorUserId, item.author));
}

export function sortNotificationItems(items: NotificationItem[]): NotificationItem[] {
  const key = (d: string, t: string) => {
    const [dd, mm, yyyy] = d.split(".");
    return `${yyyy}-${mm}-${dd} ${t}`;
  };
  return [...items].sort((a, b) => key(b.date, b.time).localeCompare(key(a.date, a.time)));
}

/**
 * Id уведомлений только по сообщениям переписки конкретной заявки (без самой
 * заявки/решения по ней) — используется, когда пользователь просто
 * разворачивает блок "Переписка" в списке заявок, не открывая её отдельным
 * окном: в этот момент имеет смысл пометить прочитанными именно сообщения,
 * которые он увидел, а не всё, что связано с заявкой.
 */
export function commentIdsForRequest(r: WorkRequest): string[] {
  return r.comments.map((c) => c.id);
}

/**
 * Все id уведомлений, относящиеся к одной заявке (сама заявка, её удаление
 * автором, если было, и все сообщения переписки) — чтобы при открытии
 * заявки можно было одним вызовом пометить прочитанным всё, что с ней связано.
 */
export function notificationIdsForRequest(r: WorkRequest): string[] {
  const ids = [`${r.id}-new`];
  if (r.status === "deleted") ids.push(`${r.id}-deleted`);
  if (r.status === "approved") ids.push(`${r.id}-approved`);
  if (r.status === "rejected") ids.push(`${r.id}-rejected`);
  ids.push(...commentIdsForRequest(r));
  return ids;
}
