import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { roleLabels, type WorkRequest } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { notificationIdsForRequest } from "@/lib/notification-items";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    request: typeof search["request"] === "string" ? (search["request"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Переписка и заявки — Учёт работ" },
      {
        name: "description",
        content:
          "Заявки прорабов на новые виды работ и переписка с администратором по каждой заявке.",
      },
      { property: "og:title", content: "Переписка и заявки — Учёт работ" },
      { property: "og:description", content: "Согласование расценок и новых видов работ." },
    ],
  }),
  component: MessagesPage,
});

const statusText: Record<WorkRequest["status"], string> = {
  pending: "На рассмотрении",
  approved: "Одобрено",
  rejected: "Отклонено",
  deleted: "Удалена автором",
};

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function MessagesPage() {
  const {
    requests,
    role,
    currentUser,
    decideRequest,
    deleteRequest,
    addRequestComment,
    units,
    markNotificationsRead,
  } = useApp();
  const { request: focusId } = Route.useSearch();
  const navigate = useNavigate();

  const isAdmin = role === "admin";
  const isForeman = role === "user";
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [resolve, setResolve] = useState<
    Record<string, { name: string; unit: string; price: string }>
  >({});

  // Реальные DOM-ссылки на textarea сообщений — нужны, чтобы схлопнуть поле
  // обратно после отправки (когда текст очищается программно, а не вводом).
  const commentRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const visible = isForeman ? requests.filter((r) => r.author === currentUser.full_name) : requests;
  const pending = visible.filter((r) => r.status === "pending");
  const history = visible.filter((r) => r.status !== "pending");

  // Заявка, открытая из уведомления — показываем её отдельным окном поверх
  // списка (акцентированный переход), а не просто подсветкой карточки в
  // общем списке. Открытие автоматически помечает прочитанным всё, что
  // относится к этой заявке (саму заявку и все сообщения переписки).
  const dialogRequest = focusId ? visible.find((r) => r.id === focusId) : undefined;
  const closeDialog = () => void navigate({ to: "/messages", search: { request: undefined } });

  useEffect(() => {
    if (!dialogRequest) return;
    markNotificationsRead(notificationIdsForRequest(dialogRequest));
  }, [dialogRequest, markNotificationsRead]);

  const [sendingComment, setSendingComment] = useState<string | null>(null);

  const sendComment = async (id: string) => {
    const text = (draft[id] ?? "").trim();
    if (!text) return;
    setDraft((d) => ({ ...d, [id]: "" }));
    requestAnimationFrame(() => autoResizeTextarea(commentRefs.current[id] ?? null));
    setSendingComment(id);
    try {
      await addRequestComment(id, text);
    } catch {
      setDraft((d) => ({ ...d, [id]: text })); // возвращаем текст в поле, если отправка не удалась
      requestAnimationFrame(() => autoResizeTextarea(commentRefs.current[id] ?? null));
      toast.error("Не удалось отправить сообщение, попробуйте ещё раз");
    } finally {
      setSendingComment(null);
    }
  };

  const [deciding, setDeciding] = useState<string | null>(null);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const data = resolve[id];
    if (status === "approved" && (!data?.name || !data.unit || !data.price)) {
      toast.error("Заполните название, единицу и цену перед одобрением");
      return;
    }
    setDeciding(id);
    try {
      await decideRequest(id, {
        status,
        ...(status === "approved" && data
          ? {
              resolved_name: data.name,
              resolved_unit: data.unit,
              resolved_price: Number(data.price) || 0,
            }
          : {}),
      });
      toast.success(status === "approved" ? "Заявка одобрена" : "Заявка отклонена");
    } catch {
      toast.error("Не удалось сохранить решение, попробуйте ещё раз");
    } finally {
      setDeciding(null);
    }
  };

  const [deletingSelected, setDeletingSelected] = useState(false);

  const deleteSelected = async () => {
    setDeletingSelected(true);
    try {
      const results = await Promise.allSettled(selected.map((id) => deleteRequest(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelected([]);
      if (failed > 0) {
        toast.error(
          failed === results.length
            ? "Не удалось удалить заявки"
            : `Удалены не все заявки (${failed} не удалось)`,
        );
      } else {
        toast.success(selected.length > 1 ? "Заявки удалены" : "Заявка удалена");
      }
    } finally {
      setDeletingSelected(false);
    }
  };

  const renderCard = (r: WorkRequest, section: "pending" | "history", inDialog = false) => {
    const canSelect = isForeman || (isAdmin && section === "history");
    return (
      <div
        key={r.id}
        {...(inDialog ? {} : { id: `request-${r.id}` })}
        className="rounded-2xl border border-border bg-card p-4 md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {canSelect && (
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(r.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, r.id] : prev.filter((s) => s !== r.id),
                  )
                }
              />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Запрошено автором
              </p>
              <p className="font-semibold md:text-lg">{r.requested_text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                {r.author} · {r.created_at}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase",
              r.status === "approved" && "bg-status-done-soft text-status-done",
              r.status === "pending" && "bg-status-review-soft text-status-review",
              r.status === "rejected" && "bg-status-rejected-soft text-status-rejected",
              r.status === "deleted" && "bg-muted text-muted-foreground",
            )}
          >
            {statusText[r.status]}
          </span>
        </div>

        {r.status === "deleted" && (
          <div className="mt-2 rounded-xl bg-muted px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Автор ({r.author}) удалил(а) эту заявку.
            </p>
          </div>
        )}

        {r.status === "approved" && (
          <div className="mt-2 rounded-xl bg-status-done-soft px-3 py-2 md:px-4 md:py-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-status-done uppercase">
              Одобрено как
            </p>
            <p className="mt-0.5 text-sm font-semibold md:text-base">{r.resolved_name}</p>
            <p className="text-xs text-muted-foreground md:text-sm">
              {r.resolved_unit}
              {isAdmin && r.resolved_price != null
                ? ` · ${r.resolved_price.toLocaleString("ru-RU")} ₽`
                : ""}
            </p>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {r.comments.map((c) => {
            const own = c.author === currentUser.full_name;
            return (
              <div key={c.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                <span
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    own ? "bg-primary text-primary-foreground" : "bg-surface",
                  )}
                >
                  {c.text}
                  <span
                    className={cn(
                      "mt-1 block text-[10px]",
                      own ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {c.author} · {c.time}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {role !== "curator" && r.status !== "deleted" && (
          <div className="mt-3 flex items-end gap-2">
            <textarea
              ref={(el) => {
                commentRefs.current[r.id] = el;
                autoResizeTextarea(el);
              }}
              value={draft[r.id] ?? ""}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [r.id]: e.target.value }));
                autoResizeTextarea(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendComment(r.id);
                }
              }}
              disabled={sendingComment === r.id}
              placeholder="Сообщение..."
              rows={1}
              className="max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-normal disabled:opacity-60"
            />
            <button
              onClick={() => void sendComment(r.id)}
              disabled={sendingComment === r.id || !(draft[r.id] ?? "").trim()}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Отправить
            </button>
          </div>
        )}

        {isAdmin && r.status === "pending" && (
          <div className="mt-3 space-y-2 rounded-xl bg-surface p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <label className="block">
                <span className="flex min-h-8 items-end">
                  <FieldLabel>Итоговое название</FieldLabel>
                </span>
                <textarea
                  ref={autoResizeTextarea}
                  value={resolve[r.id]?.name ?? ""}
                  onChange={(e) => {
                    setResolve((s) => ({
                      ...s,
                      [r.id]: { unit: "", price: "", ...s[r.id], name: e.target.value },
                    }));
                    autoResizeTextarea(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  rows={2}
                  className="mt-1 max-h-32 min-h-16 w-full resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm leading-normal"
                />
              </label>
              <label className="block">
                <span className="flex min-h-8 items-end">
                  <FieldLabel>Единица</FieldLabel>
                </span>
                <select
                  value={resolve[r.id]?.unit ?? ""}
                  onChange={(e) =>
                    setResolve((s) => ({
                      ...s,
                      [r.id]: { name: "", price: "", ...s[r.id], unit: e.target.value },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Выбрать...</option>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="flex min-h-8 items-end">
                  <FieldLabel>Цена</FieldLabel>
                </span>
                <input
                  value={resolve[r.id]?.price ?? ""}
                  onChange={(e) =>
                    setResolve((s) => ({
                      ...s,
                      [r.id]: { name: "", unit: "", ...s[r.id], price: e.target.value },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void decide(r.id, "approved")}
                disabled={deciding === r.id}
                className="flex-1 rounded-lg bg-status-done py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deciding === r.id ? "Сохранение..." : "Одобрить"}
              </button>
              <button
                onClick={() => void decide(r.id, "rejected")}
                disabled={deciding === r.id}
                className="flex-1 rounded-lg bg-status-rejected py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Отклонить
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <PageHeading
        context={roleLabels[role]}
        title={isForeman ? "Моя переписка" : "Заявки на согласование"}
      />

      {(isForeman || isAdmin) && selected.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-2 text-sm">
          Выбрано: {selected.length}
          <button
            onClick={() => void deleteSelected()}
            disabled={deletingSelected}
            className="font-semibold text-status-rejected disabled:opacity-60"
          >
            {deletingSelected ? "Удаление..." : "Удалить"}
          </button>
        </div>
      )}

      <section className="mt-5">
        <h2 className="label-caps">На рассмотрении</h2>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {pending.map((r) => renderCard(r, "pending"))}
        </div>
        {pending.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Нет заявок на рассмотрении.</p>
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">История решений</h2>
          {!isForeman && (
            <button className="text-sm font-semibold text-primary">Экспорт в Excel</button>
          )}
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {history.map((r) => renderCard(r, "history"))}
        </div>
      </section>

      <Dialog open={!!dialogRequest} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto border-none bg-transparent p-0 shadow-none sm:max-w-xl">
          <DialogTitle className="sr-only">Заявка</DialogTitle>
          {dialogRequest &&
            renderCard(
              dialogRequest,
              dialogRequest.status === "pending" ? "pending" : "history",
              true,
            )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
