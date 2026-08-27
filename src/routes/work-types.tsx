import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading } from "@/components/app/bits";
import { SwipeToAddRow } from "@/components/app/swipe-to-add-row";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBlurOnScroll } from "@/hooks/use-blur-on-scroll";
import { smartFilter } from "@/lib/smart-search";
import { getQuickDraftId, setQuickDraftId } from "@/lib/quick-draft";
import type { WorkItem, WorkType } from "@/data/mock";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/work-types")({
  head: () => ({
    meta: [
      { title: "Все виды работ — Учёт работ" },
      {
        name: "description",
        content: "Справочник видов работ: название и единица измерения, с поиском.",
      },
    ],
  }),
  component: WorkTypesPage,
});

const PER_PAGE = 30;

function WorkTypesPage() {
  const { workTypes, role, records, addRecord, updateRecord, currentUser, createRequest } =
    useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const isAdminLike = role === "admin" || role === "curator";

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  // Сворачиваем клавиатуру, как только начинается скролл списка — иначе
  // она закрывает часть позиций и мешает выбирать вид работы.
  useBlurOnScroll("app-scroll-container");

  const sendRequest = async () => {
    const text = requestText.trim();
    if (!text) return;
    setSendingRequest(true);
    try {
      await createRequest(text);
      toast.success("Заявка отправлена администратору");
      setRequestText("");
      setRequestOpen(false);
    } catch {
      toast.error("Не удалось отправить заявку, попробуйте ещё раз");
    } finally {
      setSendingRequest(false);
    }
  };

  const filtered = useMemo(() => smartFilter(workTypes, q, (w) => w.name), [workTypes, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const handleSearch = (v: string) => {
    setQ(v);
    setPage(0);
  };

  const goToRecord = (id: string) => navigate({ to: "/records/$id", params: { id } });

  const handleAddToRecord = async (type: WorkType) => {
    const newItem: WorkItem = {
      name: type.name,
      unit: type.unit,
      qty: 0,
      price: type.price,
      work_type_id: type.id,
    };
    const existingDraftId = getQuickDraftId();
    const existingDraft = existingDraftId
      ? (records.find((r) => r.id === existingDraftId && r.status === "draft") ?? null)
      : null;

    try {
      if (existingDraft) {
        const updated = await updateRecord({
          ...existingDraft,
          items: [...existingDraft.items, newItem],
        });
        toast.success(`«${type.name}» добавлено в незавершённую запись`, {
          action: { label: "Открыть запись", onClick: () => goToRecord(updated.id) },
        });
        return;
      }

      const now = new Date();
      const created = await addRecord({
        id: `r${Date.now()}`,
        object_id: "",
        execution_type: "employee",
        employees: [],
        date: new Intl.DateTimeFormat("ru-RU").format(now),
        time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now),
        items: [newItem],
        total: 0,
        comment: "",
        photos: [],
        status: "draft",
        created_by: currentUser.full_name,
      });
      setQuickDraftId(created.id);
      toast.success(`Создана новая запись, «${type.name}» добавлено`, {
        action: { label: "Открыть запись", onClick: () => goToRecord(created.id) },
      });
    } catch {
      toast.error("Не удалось добавить вид работы в запись");
    }
  };

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeading context={`Справочник · ${workTypes.length} позиций`} title="Все виды работ" />
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <FilePlus2 className="size-4" />
          Заявка
        </button>
      </div>

      <div className="relative mt-4 w-full max-w-xl lg:max-w-2xl xl:max-w-3xl">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Поиск по виду работ..."
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="sm:hidden">Свайпните позицию влево, чтобы добавить её в новую запись</span>
        <span className="hidden sm:inline">
          Нажмите «+» у позиции, чтобы добавить её в новую запись
        </span>
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {pageItems.map((w) => (
            <SwipeToAddRow key={w.id} onSwipe={() => void handleAddToRecord(w)}>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium break-words">{w.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:gap-0">
                  <span className="sm:w-16 sm:text-right">{w.unit}</span>
                  {isAdminLike && (
                    <span className="font-semibold text-foreground sm:w-24 sm:text-right">
                      {w.price.toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleAddToRecord(w)}
                    title="Добавить в новую запись"
                    aria-label={`Добавить «${w.name}» в новую запись`}
                    className="hidden shrink-0 items-center justify-center rounded-full border border-dashed border-border p-1.5 text-primary transition-colors hover:border-primary hover:bg-primary/10 sm:inline-flex"
                  >
                    <Plus className="size-4" />
                  </button>
                </span>
              </div>
            </SwipeToAddRow>
          ))}
          {!pageItems.length && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </li>
          )}
        </ul>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-xs text-muted-foreground">
            Стр. {page + 1} из {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Далее
          </button>
        </div>
      )}
      <Dialog open={requestOpen} onOpenChange={(open) => !open && setRequestOpen(false)}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
          <DialogTitle>Заявка на новый вид работы</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Не нашли нужную позицию в справочнике? Опишите, что нужно добавить — заявку рассмотрит
            администратор.
          </p>
          <textarea
            rows={4}
            autoFocus
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="Опишите недостающие позиции, по одной на строку"
            className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setRequestOpen(false)}
              className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void sendRequest()}
              disabled={sendingRequest || !requestText.trim()}
              className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {sendingRequest ? "Отправка..." : "Отправить заявку"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
