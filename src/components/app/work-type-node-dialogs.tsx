import { useEffect, useState } from "react";

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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { WorkTypeNodeUsage } from "@/data/work-type-tree";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// Диалоги управления контейнерами справочника (уровни 1–4), только admin.
// Общие для страницы справочника (три точки на карточке раздела, «+ Добавить
// раздел») и для редактора позиции (карандаш/корзина/«+» у селекторов).

export type NodeRef = { id: string; name: string };

// Понятный русский текст ошибки; сервер на 400/409 отдаёт готовое сообщение
// (дубль названия среди соседей, внутри остались живые позиции…).
export function describeNodeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Разделами справочника может управлять только администратор";
    if (err.status === 404) return "Раздел не найден — возможно, его уже удалили";
    if (err.status === 400 || err.status === 409) return err.message;
  }
  return "Не удалось выполнить действие, попробуйте ещё раз";
}

// Небольшой диалог с одним полем «Название»: и переименование, и создание.
// Диалог закрывает сам хозяин после успешного onSubmit; ошибку сервера
// показываем прямо в диалоге, введённый текст не теряется.
export function NodeNameDialog({
  title,
  description,
  initialName = "",
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  initialName?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const unchanged = trimmed === initialName.trim();

  async function submit() {
    if (busy) return;
    if (!trimmed) {
      setError("Введите название");
      return;
    }
    if (unchanged && initialName) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(describeNodeError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-4">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? undefined : "sr-only"}>
          {description ?? "Введите название"}
        </DialogDescription>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block space-y-1.5">
            <span className="label-caps">Название</span>
            <input
              autoFocus
              value={name}
              disabled={busy}
              placeholder={placeholder}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || !trimmed}
              className={cn(
                "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
                "disabled:opacity-60",
              )}
            >
              {busy ? "Сохраняем…" : submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Удаление контейнера. Сначала GET /nodes/:id/usage:
//  - внутри есть живые позиции (leaves_active > 0) — диалог-информер без
//    кнопки удаления («сначала перенесите или удалите их»);
//  - пусто — подтверждение и PATCH /nodes/:id/archive.
// onDeleted вызывается после успешной архивации; закрывает диалог хозяин.
export function DeleteNodeDialog({
  node,
  onDeleted,
  onClose,
}: {
  node: NodeRef;
  onDeleted: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [usage, setUsage] = useState<WorkTypeNodeUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getNodeUsage(node.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch((err) => {
        if (!cancelled) setError(describeNodeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      await api.archiveNode(node.id);
      await onDeleted();
    } catch (err) {
      // 409 — за время диалога внутри появились живые позиции: сервер
      // не даёт архивировать, показываем его сообщение.
      setError(describeNodeError(err));
      setDeleting(false);
    }
  }

  const blocked = usage !== null && usage.leaves_active > 0;

  return (
    <AlertDialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? "Удалить нельзя" : "Удалить раздел?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {error
              ? error
              : usage === null
                ? "Проверяем, что внутри…"
                : blocked
                  ? `Внутри «${node.name}» — ${usage.leaves_active} ${pluralPositions(usage.leaves_active)}. Сначала перенесите или удалите их.`
                  : `«${node.name}» будет заархивирован и скрыт из справочника.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {blocked ? (
            <AlertDialogCancel>Понятно</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel disabled={deleting}>
                {error && usage === null ? "Закрыть" : "Отмена"}
              </AlertDialogCancel>
              {usage !== null && (
                <AlertDialogAction
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    // Не закрываем диалог сами — он закроется после ответа сервера.
                    e.preventDefault();
                    void confirm();
                  }}
                >
                  {deleting ? "Удаляем…" : "Да, удалить"}
                </AlertDialogAction>
              )}
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// «1 позиция», «2 позиции», «5 позиций».
function pluralPositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "позиция";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "позиции";
  return "позиций";
}
