import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { roleLabels, type WorkRequest } from "@/data/mock";
import { useApp } from "@/state/use-app";

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
};

function MessagesPage() {
  const { requests, setRequests, role, currentUser, decideRequest, addRequestComment } = useApp();
  const { request: focusId } = Route.useSearch();

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`request-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, requests]);

  const isAdmin = role === "admin";
  const isForeman = role === "user";
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [resolve, setResolve] = useState<
    Record<string, { name: string; unit: string; price: string }>
  >({});

  const visible = isForeman ? requests.filter((r) => r.author === currentUser.full_name) : requests;
  const pending = visible.filter((r) => r.status === "pending");
  const history = visible.filter((r) => r.status !== "pending");

  const [sendingComment, setSendingComment] = useState<string | null>(null);

  const sendComment = async (id: string) => {
    const text = (draft[id] ?? "").trim();
    if (!text) return;
    setDraft((d) => ({ ...d, [id]: "" }));
    setSendingComment(id);
    try {
      await addRequestComment(id, text);
    } catch {
      setDraft((d) => ({ ...d, [id]: text })); // возвращаем текст в поле, если отправка не удалась
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

  const renderCard = (r: WorkRequest) => (
    <div
      key={r.id}
      id={`request-${r.id}`}
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        focusId === r.id && "border-primary ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {isForeman && (
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
            <p className="font-semibold">{r.requested_text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
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
          )}
        >
          {statusText[r.status]}
        </span>
      </div>

      {r.status === "approved" && (
        <div className="mt-2 rounded-xl bg-status-done-soft px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-status-done uppercase">
            Одобрено как
          </p>
          <p className="mt-0.5 text-sm font-semibold">{r.resolved_name}</p>
          <p className="text-xs text-muted-foreground">
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

      {role !== "curator" && (
        <div className="mt-3 flex gap-2">
          <input
            value={draft[r.id] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendComment(r.id);
            }}
            disabled={sendingComment === r.id}
            placeholder="Сообщение..."
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
          />
          <button
            onClick={() => void sendComment(r.id)}
            disabled={sendingComment === r.id || !(draft[r.id] ?? "").trim()}
            className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Отправить
          </button>
        </div>
      )}

      {isAdmin && r.status === "pending" && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label>
              <FieldLabel>Итоговое название</FieldLabel>
              <input
                value={resolve[r.id]?.name ?? ""}
                onChange={(e) =>
                  setResolve((s) => ({
                    ...s,
                    [r.id]: { unit: "", price: "", ...s[r.id], name: e.target.value },
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label>
              <FieldLabel>Единица</FieldLabel>
              <input
                value={resolve[r.id]?.unit ?? ""}
                onChange={(e) =>
                  setResolve((s) => ({
                    ...s,
                    [r.id]: { name: "", price: "", ...s[r.id], unit: e.target.value },
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label>
              <FieldLabel>Цена</FieldLabel>
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

  return (
    <AppShell>
      <PageHeading
        context={roleLabels[role]}
        title={isForeman ? "Моя переписка" : "Заявки на согласование"}
      />

      {isForeman && selected.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-2 text-sm">
          Выбрано: {selected.length}
          <button
            onClick={() => {
              setRequests((prev) => prev.filter((r) => !selected.includes(r.id)));
              setSelected([]);
              toast.success("Заявки удалены");
            }}
            className="font-semibold text-status-rejected"
          >
            Удалить
          </button>
        </div>
      )}

      <section className="mt-5">
        <h2 className="label-caps">На рассмотрении</h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {pending.map(renderCard)}
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
        <div className="mt-3 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {history.map(renderCard)}
        </div>
      </section>
    </AppShell>
  );
}
