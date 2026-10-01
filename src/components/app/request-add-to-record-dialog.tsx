import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RequestWorkType, WorkRecord } from "@/data/mock";
import { api, ApiError } from "@/lib/api-client";
import { canEditRecord, isMyRecord } from "@/lib/record-utils";
import { cn, objectLabel } from "@/lib/utils";
import { useApp } from "@/state/use-app";

// Сколько последних записей мастера предлагать.
const MAX_RECENT_RECORDS = 10;

function todayRu() {
  return new Intl.DateTimeFormat("ru-RU").format(new Date());
}

// «Внести в запись» из выполненной заявки: «Новая запись» или одна из
// последних записей мастера, которые он может редактировать. Блокировки или
// закрытия записей в приложении нет: автор правит свою запись в любом статусе
// (черновик/записано) — см. canEditRecord. Первой и с подсветкой —
// запись, из которой отправлена заявка (recordId), иначе единственный
// сегодняшний черновик. Сама строка добавляется формой записи (?add_wt=).
export function RequestAddToRecordDialog({
  workType,
  recordId,
  onClose,
}: {
  workType: RequestWorkType;
  recordId?: string | undefined;
  onClose: () => void;
}) {
  const { records, objects, role, currentUser } = useApp();
  const navigate = useNavigate();
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [missingRecord, setMissingRecord] = useState(false);

  const { list, highlightedId, highlightReason } = useMemo(() => {
    const own = records
      .filter((r) => isMyRecord(currentUser, r) && canEditRecord(role, currentUser, r))
      .sort((a, b) => Number(b.id) - Number(a.id));

    let highlighted: WorkRecord | undefined;
    let reason: string | null = null;
    const source = recordId ? own.find((r) => r.id === recordId) : undefined;
    if (source) {
      highlighted = source;
      reason = "Из этой записи отправлена заявка";
    } else {
      const today = todayRu();
      const todayDrafts = own.filter((r) => r.status === "draft" && r.date === today);
      if (todayDrafts.length === 1) {
        highlighted = todayDrafts[0];
        reason = "Открытая запись за сегодня";
      }
    }

    const rest = own.filter((r) => r.id !== highlighted?.id).slice(0, MAX_RECENT_RECORDS);
    return {
      list: highlighted ? [highlighted, ...rest.slice(0, MAX_RECENT_RECORDS - 1)] : rest,
      highlightedId: highlighted?.id ?? null,
      highlightReason: reason,
    };
  }, [records, currentUser, role, recordId]);

  const openNew = () => {
    onClose();
    void navigate({ to: "/records/new", search: { add_wt: workType.id } });
  };

  // Перед переходом проверяем, что запись ещё существует (могли удалить на
  // другом устройстве после последней синхронизации).
  const openRecord = async (id: string) => {
    setCheckingId(id);
    try {
      await api.getRecord(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setMissingRecord(true);
        setCheckingId(null);
        return;
      }
      // Сеть/сервер — не блокируем: форма записи сама покажет, если её нет.
      toast.error("Не удалось проверить запись, открываем как есть");
    }
    setCheckingId(null);
    onClose();
    void navigate({ to: "/records/$id", params: { id }, search: { add_wt: workType.id } });
  };

  const objectName = (r: WorkRecord) => {
    const obj = objects.find((o) => o.id === r.object_id);
    return obj ? objectLabel(obj.name, obj.address) : "Объект не выбран";
  };

  return (
    <Dialog open onOpenChange={(open) => !open && checkingId == null && onClose()}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Куда добавить?</DialogTitle>
          <DialogDescription className="break-words">{workType.name}</DialogDescription>
        </DialogHeader>

        {missingRecord && (
          <div
            role="alert"
            className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Эта запись уже удалена. Добавьте позицию в новую запись.
          </div>
        )}

        <button
          type="button"
          onClick={openNew}
          disabled={checkingId != null}
          className="flex w-full items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" />
          Новая запись
        </button>

        {list.length > 0 && (
          <div className="mt-1">
            <p className="label-caps">Последние записи</p>
            <div className="mt-2 space-y-2">
              {list.map((r) => {
                const highlighted = r.id === highlightedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void openRecord(r.id)}
                    disabled={checkingId != null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60",
                      highlighted ? "border-primary bg-primary/5" : "border-border bg-surface",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold break-words">
                        {objectName(r)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.date} · {r.status === "draft" ? "Черновик" : "Записано"} · позиций:{" "}
                        {r.items.length}
                      </span>
                      {highlighted && highlightReason && (
                        <span className="mt-0.5 block text-xs font-semibold text-primary">
                          {highlightReason}
                        </span>
                      )}
                    </span>
                    {checkingId === r.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
