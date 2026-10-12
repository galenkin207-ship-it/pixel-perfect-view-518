import { useState } from "react";
import { toast } from "sonner";

import { DateInput } from "@/components/app/date-input";
import { FieldLabel } from "@/components/app/bits";
import { PhotoViewer, type PhotoCaption } from "@/components/app/photo-viewer";
import { ThumbBadge } from "@/components/app/record-detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  photoThumbUrl,
  reportPhotoErrorText,
  type ObjectPhotoItem,
  type ReportPhoto,
} from "@/lib/api-client";
import {
  addDaysIso,
  formatMoscowTime,
  isoToRuDate,
  moscowDateOf,
  moscowToday,
} from "@/lib/moscow-date";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

// Галерея фото объекта: фото записей и фото-отчёты вместе, по датам
// (date у фото записи — дата работ, у фото-отчёта — photo_date). Фото-отчёты
// одной загрузки показываются «пачкой» с автором, временем и комментарием.
// Используется на странице объекта (вкладка «Фото») и в окне админа
// «Объект за сегодня».

// Фото-отчёты одной загрузки: подряд идущие, один автор, тот же комментарий
// и photo_date, загружены с интервалом не больше 15 минут.
const BATCH_GAP_MS = 15 * 60 * 1000;

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatPhotoDateHeader(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return `${WEEKDAYS[dt.getDay()]}, ${isoToRuDate(dateKey)}`;
}

type Indexed<T> = { photo: T; index: number };
type Segment =
  | { kind: "record"; items: Indexed<ObjectPhotoItem>[] }
  | { kind: "report"; items: Indexed<ReportPhoto>[] };

// Группирует уже отсортированные по дате фото в последовательные блоки по дате,
// сохраняя исходный индекс каждого фото в общем массиве (нужен для PhotoViewer,
// который листает фото сквозь границы дат, а не только внутри группы).
function groupPhotosByDate(photos: ObjectPhotoItem[]) {
  const groups: { dateKey: string; items: Indexed<ObjectPhotoItem>[] }[] = [];
  photos.forEach((photo, index) => {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === photo.date) last.items.push({ photo, index });
    else groups.push({ dateKey: photo.date, items: [{ photo, index }] });
  });
  return groups;
}

function sameBatch(a: ReportPhoto, b: ReportPhoto) {
  return (
    a.user_id === b.user_id &&
    (a.comment ?? "") === (b.comment ?? "") &&
    a.date === b.date &&
    Math.abs(new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()) <= BATCH_GAP_MS
  );
}

function splitSegments(items: Indexed<ObjectPhotoItem>[]): Segment[] {
  const segments: Segment[] = [];
  for (const item of items) {
    const last = segments[segments.length - 1];
    if (item.photo.source === "report") {
      const photo = item.photo;
      const prev = last?.kind === "report" ? last.items[last.items.length - 1] : undefined;
      if (last?.kind === "report" && prev && sameBatch(prev.photo, photo)) {
        last.items.push({ photo, index: item.index });
      } else {
        segments.push({ kind: "report", items: [{ photo, index: item.index }] });
      }
    } else if (last?.kind === "record") {
      last.items.push(item);
    } else {
      segments.push({ kind: "record", items: [item] });
    }
  }
  return segments;
}

// Когда загружено фото-отчёта. В режиме flat (окно «Объект за сегодня» —
// всё загружено сегодня) — время и, если фото задним числом, его photo_date.
function uploadMeta(photo: ReportPhoto, flat: boolean) {
  const uploadedDate = moscowDateOf(photo.uploaded_at);
  const time = formatMoscowTime(photo.uploaded_at);
  if (flat) {
    return uploadedDate === photo.date ? time : `${time} · фото за ${isoToRuDate(photo.date)}`;
  }
  return uploadedDate === photo.date
    ? `загружено в ${time}`
    : `загружено ${isoToRuDate(uploadedDate)} в ${time}`;
}

export function ObjectPhotoGallery({
  photos,
  loading,
  onChanged,
  flat = false,
  emptyText = "Фото по этому объекту пока нет",
  itemClassName = "size-24 shrink-0",
  gridClassName = "flex flex-wrap gap-2",
  headerClassName = "bg-background/95",
}: {
  photos: ObjectPhotoItem[] | null;
  loading: boolean;
  // Перезапрос после правки/удаления фото-отчёта.
  onChanged: () => void;
  // Без заголовков по датам (одна лента).
  flat?: boolean;
  emptyText?: string;
  itemClassName?: string;
  gridClassName?: string;
  headerClassName?: string;
}) {
  const { role, currentUser } = useApp();
  const isAdminLike = role === "admin" || role === "curator";
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<ReportPhoto | null>(null);

  if (loading && !photos) {
    return (
      <div className="space-y-4" role="status" aria-label="Загрузка фото">
        <div>
          <Skeleton className="mb-2 h-3 w-24" />
          <div className={gridClassName}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className={cn(itemClassName, "rounded-xl")} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!photos || photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  const canModify = (p: ObjectPhotoItem) =>
    p.source === "report" && (isAdminLike || p.user_id === currentUser.id);

  const captions: (PhotoCaption | null)[] = photos.map((p) =>
    p.source === "report"
      ? {
          badge: "Фото-отчёт",
          author: p.author_name,
          meta: `${isoToRuDate(p.date)} · ${uploadMeta(p, false)}`,
          comment: p.comment,
        }
      : null,
  );

  const renderThumbs = (items: Indexed<ObjectPhotoItem>[]) => (
    <div className={cn("min-w-0", gridClassName)}>
      {items.map(({ photo, index }) => (
        <button
          key={photo.source === "report" ? `r-${photo.id}` : `p-${photo.record_id}-${photo.url}`}
          type="button"
          onClick={() => setViewerIndex(index)}
          className={cn(
            itemClassName,
            "relative overflow-hidden rounded-xl border border-border bg-muted",
          )}
        >
          <img
            src={photoThumbUrl(photo.url)}
            alt={photo.source === "report" ? "Фото-отчёт" : "Фото объекта"}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          {photo.source === "report" && <ThumbBadge>Фото-отчёт</ThumbBadge>}
        </button>
      ))}
    </div>
  );

  const renderSegments = (items: Indexed<ObjectPhotoItem>[]) => (
    <div className="space-y-3">
      {splitSegments(items).map((seg) => {
        const first = seg.items[0]!;
        if (seg.kind === "record") {
          return <div key={`rec-${first.index}`}>{renderThumbs(seg.items)}</div>;
        }
        const head = seg.items[0]!.photo;
        return (
          <div key={`rep-${first.index}`} className="min-w-0">
            {renderThumbs(seg.items)}
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {head.author_name ?? "Автор неизвестен"}
              </span>{" "}
              · {uploadMeta(head, flat)}
            </p>
            {head.comment && (
              <p className="mt-0.5 text-sm break-words whitespace-pre-line">{head.comment}</p>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {flat ? (
        renderSegments(photos.map((photo, index) => ({ photo, index })))
      ) : (
        <div className="space-y-4">
          {groupPhotosByDate(photos).map((group) => (
            <div key={group.dateKey}>
              <p
                className={cn(
                  "sticky top-0 z-10 -mx-1 mb-2 px-1 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur",
                  headerClassName,
                )}
              >
                {formatPhotoDateHeader(group.dateKey)}
              </p>
              {renderSegments(group.items)}
            </div>
          ))}
        </div>
      )}

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos.map((p) => p.url)}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          captions={captions}
          actions={{
            canModify: (i) => !!photos[i] && canModify(photos[i]),
            onEdit: (i) => {
              const p = photos[i];
              if (p?.source !== "report") return;
              setViewerIndex(null);
              setEditing(p);
            },
            onDelete: async (i) => {
              const p = photos[i];
              if (p?.source !== "report") return;
              try {
                await api.deleteObjectPhoto(p.id);
                toast.success("Фото удалено");
                setViewerIndex(null);
                onChanged();
              } catch (err) {
                toast.error(`Не удалось удалить фото: ${reportPhotoErrorText(err)}`);
              }
            },
          }}
        />
      )}

      {editing && (
        <ReportPhotoEditDialog
          photo={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function ReportPhotoEditDialog({
  photo,
  onClose,
  onSaved,
}: {
  photo: ReportPhoto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = moscowToday();
  const [date, setDate] = useState(photo.date);
  const [comment, setComment] = useState(photo.comment ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    // Отправляем только изменённые поля: у старого фото (старше 30 дней)
    // неизменённая дата не прошла бы проверку бэкенда.
    const patch: { photo_date?: string; comment?: string } = {};
    if (date !== photo.date) patch.photo_date = date;
    if (comment.trim() !== (photo.comment ?? "")) patch.comment = comment;
    if (!patch.photo_date && patch.comment === undefined) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await api.updateObjectPhoto(photo.id, patch);
      toast.success("Фото обновлено");
      onSaved();
    } catch (err) {
      toast.error(`Не удалось сохранить: ${reportPhotoErrorText(err)}`);
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Фото-отчёт</DialogTitle>
          <DialogDescription>Изменение даты и комментария этого фото.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel>Дата фото</FieldLabel>
            <DateInput
              className="mt-1"
              value={date}
              onChange={(v) => v && setDate(v)}
              min={addDaysIso(today, -30)}
              max={today}
              todayValue={today}
              clearable={false}
            />
          </div>
          <div>
            <FieldLabel>Комментарий</FieldLabel>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Необязательно"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
