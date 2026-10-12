import { Camera, Image as ImageIcon, RefreshCw, WifiOff, X } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { FieldLabel } from "@/components/app/bits";
import { DateInput } from "@/components/app/date-input";
import { useModalClose } from "@/hooks/use-modal-close";
import { api, isNetworkError, reportPhotoErrorText } from "@/lib/api-client";
import { addDaysIso, moscowToday } from "@/lib/moscow-date";
import {
  compressImage,
  createRepeatedSelectionGuard,
  filterAcceptablePhotos,
} from "@/lib/photo-files";
import { cn } from "@/lib/utils";

// «Фото за день»: загрузка фото-отчёта по объекту — просто фото за дату, без
// видов работ, сотрудников и объёмов. Комментарий один на всю загрузку.
// Без офлайн-очереди: если связи нет, выбранные фото остаются в форме, и их
// можно отправить повторно.

// Сколько фото можно выбрать за одну загрузку.
const MAX_PHOTOS_PER_UPLOAD = 30;
// Насколько назад можно указать дату (как PHOTO_DATE_MAX_AGE_DAYS на бэкенде).
const MAX_AGE_DAYS = 30;

type Item = { file: File; preview: string; error?: string };

export function ReportPhotoUpload({
  objectId,
  objectName,
  onClose,
  onUploaded,
}: {
  objectId: string;
  objectName: string;
  onClose: () => void;
  // После загрузки хотя бы одного фото — обновить галерею объекта.
  onUploaded: () => void;
}) {
  const { closing, requestClose } = useModalClose(onClose);
  const today = moscowToday();
  const [date, setDate] = useState(today);
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const isRepeatedSelection = useRef(createRepeatedSelectionGuard()).current;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const uploading = progress !== null;

  // Превью — object URL, освобождаем при закрытии формы.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.preview);
    },
    [],
  );

  // Пока идёт отправка — предупреждение при закрытии/перезагрузке вкладки.
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploading]);

  const tryClose = () => {
    if (uploading) {
      toast.warning("Идёт отправка фото — дождитесь окончания");
      return;
    }
    if (items.length > 0 && !window.confirm("Выбранные фото не отправлены. Закрыть?")) return;
    requestClose();
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    // Повторное событие change для того же снимка (iOS) — см. photo-files.ts.
    if (isRepeatedSelection(arr)) return;

    const toProcess = filterAcceptablePhotos(arr);
    if (toProcess.length === 0) return;

    const roomLeft = MAX_PHOTOS_PER_UPLOAD - items.length;
    if (roomLeft <= 0) {
      toast.error(`Не больше ${MAX_PHOTOS_PER_UPLOAD} фото за раз`);
      return;
    }
    if (toProcess.length > roomLeft) {
      toast.error(`Не больше ${MAX_PHOTOS_PER_UPLOAD} фото за раз — добавлены первые ${roomLeft}`);
      toProcess.length = roomLeft;
    }

    setCompressing(true);
    void Promise.all(toProcess.map(compressImage))
      .catch(() => toProcess)
      .then((compressed) => {
        setItems((prev) => [
          ...prev,
          ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) })),
        ]);
      })
      .finally(() => setCompressing(false));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => {
      const it = prev[idx];
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const dateValid = date >= addDaysIso(today, -MAX_AGE_DAYS) && date <= today;

  const send = async () => {
    if (!items.length || uploading || compressing) return;
    if (!dateValid) {
      toast.error(`Дата — не позже сегодня и не раньше чем ${MAX_AGE_DAYS} дней назад`);
      return;
    }
    setOffline(false);
    const toSend = items;
    setItems((prev) => prev.map(({ error: _e, ...rest }) => rest));
    setProgress({ done: 0, total: toSend.length });
    const result = await api.uploadReportPhotos(
      objectId,
      toSend.map((it) => it.file),
      { photo_date: date, comment },
      (done, total) => setProgress({ done, total }),
    );
    setProgress(null);

    const failedByFile = new Map(result.failed.map((f) => [f.file, f.error]));
    const sentOk = toSend.filter((it) => !failedByFile.has(it.file));
    for (const it of sentOk) URL.revokeObjectURL(it.preview);
    setItems((prev) =>
      prev
        .filter((it) => failedByFile.has(it.file))
        .map((it) => ({ ...it, error: reportPhotoErrorText(failedByFile.get(it.file)) })),
    );

    if (sentOk.length > 0) onUploaded();

    if (result.failed.length === 0) {
      toast.success(`Фото отправлены: ${sentOk.length}`);
      requestClose();
      return;
    }
    if (result.failed.some((f) => isNetworkError(f.error))) setOffline(true);
    toast.error(
      sentOk.length > 0
        ? `Отправлено ${sentOk.length} из ${toSend.length}. Остальные можно отправить повторно`
        : `Фото не отправлены: ${reportPhotoErrorText(result.failed[0]!.error)}`,
    );
  };

  const hasFailed = items.some((it) => it.error);

  // Портал + data-pull-refresh-ignore + overscroll-behavior-y: contain — как в
  // RecordDetail: иначе pull-to-refresh фоновой страницы перехватывает свайп
  // внутри окна и скролл "подвисает" на iOS/Android.
  return createPortal(
    <motion.div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex bg-black/50 md:items-center md:justify-center md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) tryClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Фото за день"
        className="flex h-full w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-card p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-3xl md:p-6"
        style={{ overscrollBehaviorY: "contain" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: closing ? 0 : 1, y: closing ? 16 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs break-words text-muted-foreground">{objectName}</p>
            <h2 className="mt-0.5 text-lg font-bold">Фото за день</h2>
          </div>
          <button
            type="button"
            onClick={tryClose}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <FieldLabel>Дата</FieldLabel>
            <DateInput
              className="mt-1"
              value={date}
              onChange={(v) => v && setDate(v)}
              min={addDaysIso(today, -MAX_AGE_DAYS)}
              max={today}
              todayValue={today}
              clearable={false}
            />
          </div>

          <div>
            <FieldLabel>Фото</FieldLabel>
            <div className="mt-1 flex gap-2">
              <label
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold",
                  (compressing || uploading) && "pointer-events-none opacity-60",
                )}
              >
                <Camera className="size-4" /> Снять фото
                {/* Без multiple: на iOS capture + multiple даёт только один
                    снимок, а следующий можно снять повторным нажатием. */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={compressing || uploading}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <label
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold",
                  (compressing || uploading) && "pointer-events-none opacity-60",
                )}
              >
                <ImageIcon className="size-4" /> Из галереи
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={compressing || uploading}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {compressing && <p className="mt-1.5 text-xs text-muted-foreground">Сжимаем фото...</p>}
            {items.length > 0 && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Выбрано: {items.length} из {MAX_PHOTOS_PER_UPLOAD}
                </p>
                <div className="mt-2 grid min-w-0 grid-cols-4 gap-2 overflow-x-hidden sm:grid-cols-5">
                  {items.map((it, idx) => (
                    <div key={it.preview} className="relative aspect-square min-w-0">
                      <img
                        src={it.preview}
                        alt="Выбранное фото"
                        className={cn(
                          "size-full rounded-lg object-cover",
                          it.error && "ring-2 ring-destructive",
                        )}
                      />
                      {!uploading && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          aria-label="Убрать фото"
                          className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-0.5"
                        >
                          <X className="size-3 text-white" />
                        </button>
                      )}
                      {it.error && (
                        <span
                          title={it.error}
                          className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-destructive/90 px-1 py-0.5 text-[9px] font-semibold text-destructive-foreground"
                        >
                          {it.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <FieldLabel>Комментарий</FieldLabel>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={uploading}
              placeholder="Необязательно — один на все фото"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            />
          </div>

          {offline && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>Нет связи, фото не отправлены. Проверьте интернет и нажмите «Повторить».</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          {progress && (
            <div className="mb-3" role="status">
              <p className="text-xs font-semibold text-muted-foreground">
                Отправлено {progress.done} из {progress.total}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={!items.length || uploading || compressing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {uploading ? (
              `Отправка ${progress?.done ?? 0} из ${progress?.total ?? 0}...`
            ) : hasFailed ? (
              <>
                <RefreshCw className="size-4" />
                Повторить
              </>
            ) : (
              `Отправить${items.length ? ` (${items.length})` : ""}`
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
