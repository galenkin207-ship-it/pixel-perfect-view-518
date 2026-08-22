import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Inbox, MessageSquare, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/use-app";

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
  const { requests, role, currentUser } = useApp();
  const isForeman = role === "user";

  const items = useMemo(() => {
    const visible = isForeman
      ? requests.filter((r) => r.author === currentUser.full_name)
      : requests;
    const list = visible.flatMap((r) => [
      {
        id: `${r.id}-new`,
        requestId: r.id,
        kind: "request" as const,
        author: r.author,
        title: "Новая заявка на вид работ",
        text: r.requested_text,
        date: r.created_at,
        time: r.comments[0]?.time ?? "—",
      },
      ...(r.status === "deleted"
        ? [
            {
              id: `${r.id}-deleted`,
              requestId: r.id,
              kind: "deleted" as const,
              author: r.author,
              title: "Заявка удалена автором",
              text: r.requested_text,
              date: r.created_at,
              time: "—",
            },
          ]
        : []),
      ...r.comments.map((c) => ({
        id: c.id,
        requestId: r.id,
        kind: "comment" as const,
        author: c.author,
        title: `Сообщение по заявке: ${r.requested_text}`,
        text: c.text,
        date: r.created_at,
        time: c.time,
      })),
    ]);
    const key = (d: string, t: string) => {
      const [dd, mm, yyyy] = d.split(".");
      return `${yyyy}-${mm}-${dd} ${t}`;
    };
    return list.sort((a, b) => key(b.date, b.time).localeCompare(key(a.date, a.time)));
  }, [requests, isForeman, currentUser.full_name]);

  const unread = items.filter((i) => i.author !== currentUser.full_name).length;

  return (
    <AppShell>
      <PageHeading context={roleLabels[role]} title="Уведомления" />
      <p className="mt-1 text-sm text-muted-foreground">
        {unread > 0
          ? `Непрочитанных: ${unread}. Нажмите на уведомление, чтобы открыть обсуждение заявки.`
          : "Новых уведомлений нет."}
      </p>

      <ul className="mt-5 space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              to="/messages"
              search={{ request: n.requestId }}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              <InitialsAvatar name={n.author} className="size-10 shrink-0 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{n.author}</span>
                  <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    {n.kind === "comment" && <MessageSquare className="size-3" />}
                    {n.kind === "request" && <Inbox className="size-3" />}
                    {n.kind === "deleted" && <Trash2 className="size-3" />}
                    {n.kind === "comment"
                      ? "Сообщение"
                      : n.kind === "deleted"
                        ? "Удалена"
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
        ))}
        {!items.length && (
          <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Уведомлений пока нет.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
