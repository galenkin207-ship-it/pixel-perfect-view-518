import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { CheckCircle2, Inbox, MessageSquare, Trash2, XCircle } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { buildNotificationItems, sortNotificationItems } from "@/lib/notification-items";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Уведомления — Учёт работ" },
      {
        name: "description",
        content:
          "Список уведомлений по заявкам: от кого, когда и во сколько, с переходом к обсуждению заявки.",
      },
      { property: "og:title", content: "Уведомления — Учёт работ" },
      {
        property: "og:description",
        content: "Все сообщения и события по заявкам в одном списке.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { requests, role, currentUser, readNotificationIds, markNotificationsRead } = useApp();
  const isForeman = role === "user";

  const items = useMemo(() => {
    const list = buildNotificationItems(requests, isForeman, currentUser.full_name);
    return sortNotificationItems(list);
  }, [requests, isForeman, currentUser.full_name]);

  const isUnread = (id: string, author: string) =>
    author !== currentUser.full_name && !readNotificationIds.has(id);
  const unread = items.filter((i) => isUnread(i.id, i.author)).length;

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Уведомления" />
      <p className="mt-1 text-sm text-muted-foreground">
        {unread > 0
          ? `Непрочитанных: ${unread}. Нажмите на уведомление, чтобы открыть обсуждение заявки.`
          : "Новых уведомлений нет."}
      </p>

      <ul className="mt-5 space-y-2">
        {items.map((n) => {
          const unreadItem = isUnread(n.id, n.author);
          return (
            <li key={n.id}>
              <Link
                to="/messages"
                search={{ request: n.requestId, from: "notifications" }}
                onClick={() => markNotificationsRead([n.id])}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted",
                  unreadItem ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <span className="relative shrink-0">
                  <InitialsAvatar name={n.author} className="size-10 text-xs" />
                  {unreadItem && (
                    <span
                      aria-label="Непрочитано"
                      className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{n.author}</span>
                    <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                      {n.kind === "comment" && <MessageSquare className="size-3" />}
                      {n.kind === "request" && <Inbox className="size-3" />}
                      {n.kind === "deleted" && <Trash2 className="size-3" />}
                      {n.kind === "approved" && <CheckCircle2 className="size-3" />}
                      {n.kind === "rejected" && <XCircle className="size-3" />}
                      {n.kind === "comment"
                        ? "Сообщение"
                        : n.kind === "deleted"
                          ? "Удалена"
                          : n.kind === "approved"
                            ? "Одобрено"
                            : n.kind === "rejected"
                              ? "Отклонено"
                              : "Заявка"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm break-words whitespace-normal">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground break-words whitespace-normal">
                    {n.text}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block">{n.date}</span>
                  <span className="block">{n.time}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {!items.length && (
          <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Уведомлений пока нет.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
