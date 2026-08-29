import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCheck,
  CheckCircle2,
  Inbox,
  ListFilter,
  MessageSquare,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const {
    requests,
    role,
    currentUser,
    readNotificationIds,
    markNotificationsRead,
    hideNotifications,
  } = useApp();
  const isForeman = role === "user";

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);

  const items = useMemo(() => {
    const list = buildNotificationItems(requests, isForeman, currentUser.full_name);
    return sortNotificationItems(list);
  }, [requests, isForeman, currentUser.full_name]);

  const isUnread = (id: string, author: string) =>
    author !== currentUser.full_name && !readNotificationIds.has(id);
  const unread = items.filter((i) => isUnread(i.id, i.author)).length;

  const visibleItems = useMemo(
    () => (unreadOnly ? items.filter((n) => isUnread(n.id, n.author)) : items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, unreadOnly, readNotificationIds, currentUser.full_name],
  );

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((n) => selectedIds.has(n.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const n of visibleItems) next.delete(n.id);
      } else {
        for (const n of visibleItems) next.add(n.id);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleMarkRead = () => {
    markNotificationsRead([...selectedIds]);
    exitSelectionMode();
  };

  const handleDelete = () => {
    hideNotifications([...selectedIds]);
    exitSelectionMode();
  };

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeading context={roleLabels[role]} title="Уведомления" />
        {!selectionMode && items.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
            Выбрать
          </Button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unread > 0
            ? `Непрочитанных: ${unread}. Нажмите на уведомление, чтобы открыть обсуждение заявки.`
            : "Новых уведомлений нет."}
        </p>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => setUnreadOnly((v) => !v)}
        >
          <ListFilter className="size-3.5" />
          Непрочитанные
        </Button>
      </div>

      {selectionMode && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
          <label className="flex items-center gap-3">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Выбрать все"
            />
            <span className="text-sm text-muted-foreground">Выбрано: {selectedIds.size}</span>
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedIds.size}
              onClick={handleMarkRead}
            >
              <CheckCheck className="size-3.5" />
              Прочитано
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!selectedIds.size}
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" />
              Удалить
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exitSelectionMode}
              aria-label="Отменить выбор"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-5 space-y-2">
        {visibleItems.map((n) => {
          const unreadItem = isUnread(n.id, n.author);
          const selected = selectedIds.has(n.id);

          const inner = (
            <>
              {selectionMode && (
                <span className="flex shrink-0 items-center self-center">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleSelected(n.id)}
                    aria-label="Выбрать уведомление"
                  />
                </span>
              )}
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
            </>
          );

          const itemClassName = cn(
            "flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted",
            unreadItem ? "border-primary/40 bg-primary/5" : "border-border",
            selected && "border-primary ring-2 ring-primary/50",
          );

          if (selectionMode) {
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => toggleSelected(n.id)}
                  className={itemClassName}
                >
                  {inner}
                </button>
              </li>
            );
          }

          return (
            <li key={n.id}>
              <Link
                to="/messages"
                search={{ request: n.requestId, from: "notifications" }}
                onClick={() => markNotificationsRead([n.id])}
                className={itemClassName}
              >
                {inner}
              </Link>
            </li>
          );
        })}
        {!visibleItems.length && (
          <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {unreadOnly ? "Непрочитанных уведомлений нет." : "Уведомлений пока нет."}
          </li>
        )}
      </ul>
    </AppShell>
  );
}
