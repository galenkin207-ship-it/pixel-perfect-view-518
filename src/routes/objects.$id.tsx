import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ImageIcon, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { InitialsAvatar, PageHeading } from "@/components/app/bits";
import { RecordDetail } from "@/components/app/record-detail";
import { StatusBadge } from "@/components/app/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { itemQty } from "@/lib/record-utils";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/objects/$id")({
  head: () => ({
    meta: [
      { title: "Записи по объекту — Учёт работ" },
      {
        name: "description",
        content: "Выполненные работы по объекту: вид работы, объём, исполнитель и статус.",
      },
      { property: "og:title", content: "Записи по объекту — Учёт работ" },
      {
        property: "og:description",
        content: "Хронология выполненных работ на строительном объекте.",
      },
    ],
  }),
  component: ObjectRecordsPage,
});

function ObjectRecordsPage() {
  const { id } = useParams({ from: "/objects/$id" });
  const {
    objects,
    records,
    role,
    currentUser,
    archiveObject,
    restoreObject,
    pinnedObjectIds,
    hiddenObjectIds,
    showObjectOnHome,
    hideObjectFromHome,
  } = useApp();
  const object = objects.find((o) => o.id === id);
  const list = records.filter((r) => r.object_id === id);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRecord = records.find((r) => r.id === openId) ?? null;
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const canManage = role === "curator" || role === "admin";
  const isForeman = role === "user";

  if (!object) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Объект не найден.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
          К списку объектов
        </Link>
      </AppShell>
    );
  }

  const isArchived = object.status === "archived";
  // Признак "есть записи" считаем так же, как на главной: у "Кто подал" —
  // только свои записи, иначе — все. Иначе кнопка на этой странице и на
  // главной экране будет решать по-разному, есть ли у объекта записи, и
  // состояние "закреплён/скрыт" разъедется.
  const hasRecords = isForeman
    ? list.some((r) => r.created_by === currentUser.full_name)
    : list.length > 0;
  const isPinned = pinnedObjectIds.includes(object.id);
  const isHidden = hiddenObjectIds.includes(object.id);
  // Показан ли объект сейчас на главном экране — та же логика, что и на
  // самой главной странице и в шторке "Добавить объект".
  const shownOnHome = !isHidden && (hasRecords || isPinned);

  const toggleHome = async () => {
    setPinBusy(true);
    try {
      if (shownOnHome) {
        await hideObjectFromHome(object.id);
        toast.success("Объект откреплён от главного экрана");
      } else {
        await showObjectOnHome(object.id);
        toast.success("Объект возвращён на главный экран");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить видимость объекта");
    } finally {
      setPinBusy(false);
    }
  };

  const runArchive = async () => {
    setBusy(true);
    try {
      await archiveObject(object.id);
      toast.success("Объект перенесён в архив");
      setConfirmArchiveOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async () => {
    setBusy(true);
    try {
      await restoreObject(object.id);
      toast.success("Объект возвращён в активную работу");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell {...(isArchived ? {} : { fab: { to: "/records/new", search: { object: id } } })}>
      <div className="bg-background pt-5 pb-3 md:sticky md:top-0 md:z-20 md:border-b md:border-border md:pt-6 md:shadow-[0_8px_12px_-10px_rgba(15,23,42,0.35)] xl:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeading context={object.address} title={object.name} />
          <div className="flex items-center gap-2">
            {!isArchived && (
              <button
                type="button"
                disabled={pinBusy}
                onClick={() => void toggleHome()}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
              >
                {shownOnHome ? (
                  <>
                    <PinOff className="size-3.5" />
                    {pinBusy ? "..." : "Открепить"}
                  </>
                ) : (
                  <>
                    <Pin className="size-3.5" />
                    {pinBusy ? "..." : "Показать на главном"}
                  </>
                )}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (isArchived) {
                    void runRestore();
                  } else {
                    setConfirmArchiveOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="size-3.5" />
                    {busy ? "..." : "Вернуть из архива"}
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" />
                    {busy ? "..." : "Завершить объект"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {isArchived && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            Объект в архиве — работы завершены, новые записи по нему не добавляются.
          </p>
        )}

        <div className="mt-5 hidden grid-cols-[2.6fr_1.1fr_1.2fr_1.1fr_1fr] gap-3 rounded-t-2xl border border-border bg-card px-4 py-3 lg:grid">
          <span className="label-caps">Вид работы</span>
          <span className="label-caps">Кто подал</span>
          <span className="label-caps">Сотрудник / Бригада</span>
          <span className="label-caps">Дата</span>
          <span className="label-caps">Статус</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border lg:rounded-t-none lg:border-t-0">
        {list.map((r) => {
          const performer =
            r.execution_type === "brigade" ? (r.brigade_name ?? "") : r.employees.join(", ");
          return (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setOpenId(r.id)}
                className="grid h-auto w-full auto-rows-min grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-muted/40 lg:grid-cols-[2.6fr_1.1fr_1.2fr_1.1fr_1fr] lg:items-start lg:gap-3"
              >
                <span className="flex flex-col gap-1">
                  {r.items.map((item, i) => (
                    <span
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                    >
                      <span className="text-base font-semibold break-words text-foreground">
                        {item.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold tabular-nums text-primary">
                        {itemQty(item)} {item.unit}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="flex items-center gap-2 text-sm break-words">
                  <InitialsAvatar name={r.created_by} />
                  {r.created_by}
                </span>
                <span className="text-sm break-words">{performer}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                  <span>
                    {r.date.slice(0, 5)}, {r.time}
                  </span>
                  {r.photos.length > 0 && (
                    <span
                      className="flex items-center gap-0.5 font-semibold text-primary"
                      title={`${r.photos.length} фото`}
                    >
                      <ImageIcon className="size-4" />
                      {r.photos.length}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                </span>
              </button>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            По этому объекту записей пока нет.
          </p>
        )}
      </div>

      {openRecord && <RecordDetail record={openRecord} onClose={() => setOpenId(null)} />}

      <AlertDialog
        open={confirmArchiveOpen}
        onOpenChange={(open) => !busy && setConfirmArchiveOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить объект «{object.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Объект будет перенесён в архив: новые записи по нему создавать будет нельзя, а сам
              объект пропадёт из основного списка активных объектов. Все уже внесённые записи и
              история сохранятся, и объект всегда можно будет вернуть из архива обратно в активную
              работу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void runArchive()}>
              {busy ? "Завершаем…" : "Завершить объект"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
