import { useNavigate } from "@tanstack/react-router";
import { Camera, Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FieldLabel, PageHeading } from "@/components/app/bits";
import { EmployeeSelect } from "@/components/app/employee-select";
import { NumberField } from "@/components/app/number-field";
import { ObjectSelect } from "@/components/app/object-select";
import { useBlurOnScroll } from "@/hooks/use-blur-on-scroll";
import { cn } from "@/lib/utils";
import { itemQty, recordTotal, round2, syncItem } from "@/lib/record-utils";
import { smartFilter } from "@/lib/smart-search";
import { api } from "@/lib/api-client";
import { clearQuickDraftId } from "@/lib/quick-draft";
import type { WorkItem, WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

function toIso(ru?: string) {
  const m = ru?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Как в старом приложении: фото сжимаются на телефоне перед отправкой, чтобы
// не гонять по мобильной сети тяжёлые снимки с камеры (10-15 МБ HEIC/JPEG).
// PHOTO_TARGET_SIZE_BYTES — ориентир, до которого пытаемся ужать (не гарантия).
const PHOTO_TARGET_SIZE_BYTES = 450 * 1024; // ~450 КБ
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_MIN_QUALITY = 0.4;
// Совсем огромные/битые файлы даже не пытаемся декодировать в браузере —
// сразу отклоняем (страховка, совпадает по духу с лимитом на бэкенде).
const PHOTO_MAX_RAW_SIZE_BYTES = 30 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  try {
    // HEIC/HEIF браузеры (кроме Safari) не умеют декодировать через canvas —
    // отправляем как есть, сервер сам переконвертирует и сожмёт при обработке.
    if (/\.(heic|heif)$/i.test(file.name)) return file;
    if (typeof createImageBitmap !== "function") return file;

    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale) || bitmap.width;
    const height = Math.round(bitmap.height * scale) || bitmap.height;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const toBlob = (quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

    let quality = 0.85;
    let blob = await toBlob(quality);
    while (blob && blob.size > PHOTO_TARGET_SIZE_BYTES && quality > PHOTO_MIN_QUALITY) {
      quality -= 0.1;
      blob = await toBlob(quality);
    }
    if (!blob || blob.size === 0) return file;

    // Камера (capture="environment") на многих мобильных браузерах отдаёт File
    // с пустым name — тогда без запасного варианта имя превратилось бы в
    // ".jpg" (файл-с-точки), а path.extname('.jpg') на бэкенде вернёт "" и
    // сервер молча пропустит такое фото при сохранении.
    const base = file.name.replace(/\.\w+$/, "").trim() || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // Что бы ни пошло не так при сжатии (нет createImageBitmap, ошибка canvas
    // и т.п.) — отправляем оригинал файла как есть, сервер сам его обработает.
    // Фото не должно теряться из-за сбоя сжатия на конкретном устройстве.
    return file;
  }
}

function fromIso(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function RecordForm({
  record,
  defaultObjectId,
}: {
  record?: WorkRecord;
  defaultObjectId?: string;
}) {
  const navigate = useNavigate();
  const {
    objects,
    employees,
    brigades,
    workTypes,
    role,
    addRecord,
    updateRecord,
    deleteRecord,
    setRecordPhotos,
    createRequest,
    currentUser,
  } = useApp();

  const isAdmin = role === "admin";

  const [objectId, setObjectId] = useState(record?.object_id ?? defaultObjectId ?? "");
  const [items, setItems] = useState<WorkItem[]>(record?.items ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>(record?.employees ?? []);
  const [comment, setComment] = useState(record?.comment ?? "");
  const [photos, setPhotos] = useState<string[]>(record?.photos ?? []); // уже загруженные (URL с сервера)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // выбраны, но ещё не отправлены
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const compressionPromiseRef = useRef<Promise<void> | null>(null);
  const lastAddSignatureRef = useRef<string | null>(null);
  const lastAddTimeRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const [dateIso, setDateIso] = useState(() => toIso(record?.date));

  const object = objects.find((o) => o.id === objectId) ?? null;
  const total = recordTotal(items);

  // В выборе объекта для новой/редактируемой записи не показываем архивные —
  // кроме уже выбранного, чтобы редактирование старой записи на завершённом
  // объекте по-прежнему открывалось корректно.
  const selectableObjects = objects.filter((o) => o.status !== "archived" || o.id === objectId);

  // --- Автосохранение черновика ---
  // Черновик сохраняется практически сразу, как только в форме появились/изменились
  // данные — и при первом создании записи, и при продолжении заполнения уже
  // сохранённого ранее черновика. Короткая пауза нужна только чтобы не слать запрос
  // на каждое нажатие клавиши.
  const AUTO_SAVE_DEBOUNCE_MS = 1200;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  // id черновика, автоматически созданного/обновляемого в этой сессии
  const draftRecordIdRef = useRef<string | undefined>(record?.id);
  // true, если именно мы создали новую запись автосохранением (а не открыли существующую)
  const createdDraftInSessionRef = useRef(false);

  const hasEnteredData = () =>
    items.length > 0 ||
    comment.trim().length > 0 ||
    photos.length > 0 ||
    pendingFiles.length > 0 ||
    selectedEmployees.length > 0;

  // Автосохранение работает и для новой записи, и для уже сохранённого черновика —
  // но не для завершённой записи (status === "done"), её тихо перезаписывать не нужно.
  const isDraftEditable = !record || record.status === "draft";
  // Не автосохраняем на самом первом рендере (в том числе при открытии уже
  // существующего черновика) — только когда пользователь реально что-то изменил.
  const mountedOnceRef = useRef(false);

  useEffect(() => {
    if (!isDraftEditable) return;
    if (cancelledRef.current) return;

    if (!mountedOnceRef.current) {
      mountedOnceRef.current = true;
      return;
    }

    if (!hasEnteredData()) return;

    const timer = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void autoSaveDraft();
    }, AUTO_SAVE_DEBOUNCE_MS);
    autoSaveTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      autoSaveTimerRef.current = null;
    };
    // `photos` намеренно НЕ в зависимостях: это состояние, которое сама же
    // автосохранение обновляет после успешной загрузки фото (см.
    // commitUploadedPhotos). Если держать его в deps, каждое успешное
    // автосохранение тут же планирует СЛЕДУЮЩЕЕ — и так до бесконечности,
    // пока в форме есть хоть что-то (это и порождало "лишние" срабатывания
    // и дублирующиеся превью при добавлении следующих фото).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, dateIso, items, comment, pendingFiles, selectedEmployees, isDraftEditable]);

  const buildPayload = (status: "draft" | "done"): WorkRecord => {
    const now = new Date();
    return {
      id: draftRecordIdRef.current ?? record?.id ?? `r${Date.now()}`,
      object_id: objectId,
      execution_type: "employee",
      employees: selectedEmployees,
      date: fromIso(dateIso) || new Intl.DateTimeFormat("ru-RU").format(now),
      time:
        record?.time ??
        new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now),
      items,
      total,
      comment,
      photos,
      status,
      created_by: record?.created_by ?? currentUser.full_name,
      ...(record
        ? {
            updated_by: currentUser.full_name,
            updated_at: `${new Intl.DateTimeFormat("ru-RU").format(now)}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now)}`,
          }
        : {}),
    };
  };

  const autoSaveDraft = async () => {
    if (cancelledRef.current || !isDraftEditable) return;
    if (autoSaveInFlightRef.current) return; // предыдущее автосохранение ещё не завершилось
    if (compressionPromiseRef.current) await compressionPromiseRef.current;
    if (cancelledRef.current) return;
    if (!hasEnteredData()) return;

    autoSaveInFlightRef.current = true;
    const existingId = draftRecordIdRef.current;
    const filesToUpload = pendingFiles;
    const payload = buildPayload("draft");
    try {
      const saved = existingId ? await updateRecord(payload) : await addRecord(payload);

      if (cancelledRef.current) {
        // Пользователь успел нажать «Отменить», пока шло сохранение — убираем черновик
        if (!existingId) {
          try {
            await deleteRecord(saved.id);
          } catch {
            // не критично, просто не удалось подчистить черновик
          }
        }
        return;
      }

      draftRecordIdRef.current = saved.id;
      if (!existingId) createdDraftInSessionRef.current = true;

      if (filesToUpload.length > 0) {
        try {
          const uploaded = await api.uploadPhotos(saved.id, filesToUpload);
          commitUploadedPhotos(saved.id, filesToUpload, uploaded);
        } catch (photoErr) {
          console.error("Автосохранение: не удалось загрузить фото:", photoErr);
          const detail = photoErr instanceof Error ? photoErr.message : String(photoErr);
          toast.error(`Фото не загрузились при автосохранении: ${detail}`);
        }
      }

      // Тост "черновик сохранён" — только при первом автосохранении (создании
      // записи). При дальнейшем редактировании сохранение идёт молча.
      if (!existingId) {
        toast.success("Черновик сохранён автоматически");
      }
    } catch (err) {
      console.error("Автосохранение черновика не удалось:", err);
      toast.error("Не удалось автоматически сохранить черновик");
    } finally {
      autoSaveInFlightRef.current = false;
    }
  };

  const applyCrew = (next: string[]) => {
    setSelectedEmployees(next);
    setItems((prev) => prev.map((it) => syncItem(it, next)));
  };

  const crew = selectedEmployees;

  // Заполнить состав записи из сохранённой бригады пользователя — просто
  // удобный способ быстро добавить нескольких сотрудников разом, ничего не
  // сохраняет отдельно: запись как обычно хранит employees по фамилиям.
  const fillFromBrigade = (brigadeId: string) => {
    const brigade = brigades.find((b) => b.id === brigadeId);
    if (!brigade) return;
    const merged = [...selectedEmployees];
    for (const name of brigade.members) {
      if (!merged.includes(name)) merged.push(name);
    }
    applyCrew(merged);
  };

  const setItemCrew = (idx: number, next: string[]) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? syncItem(it, next) : it)));

  const setItemTotal = (idx: number, qty: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const base = { ...it, qty, manual: false };
        return syncItem(
          base,
          (it.allocations ?? []).map((a) => a.employee),
        );
      }),
    );

  const setAllocation = (idx: number, employee: string, qty: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const allocations = (it.allocations ?? []).map((a) =>
          a.employee === employee ? { ...a, qty } : a,
        );
        return {
          ...it,
          manual: true,
          allocations,
          qty: round2(allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0)),
        };
      }),
    );

  const save = async (status: "draft" | "done") => {
    if (status === "done" && !objectId) {
      toast.error("Выберите объект");
      return;
    }
    if (status === "done" && items.length === 0) {
      toast.error("Добавьте хотя бы один вид работы");
      return;
    }

    if (compressionPromiseRef.current) await compressionPromiseRef.current;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const existingId = draftRecordIdRef.current ?? record?.id;
    const payload = buildPayload(status);

    setSaving(true);
    try {
      const saved = existingId ? await updateRecord(payload) : await addRecord(payload);
      draftRecordIdRef.current = saved.id;
      // Запись теперь под ручным контролем пользователя — свайпы на странице
      // "Все виды работ" больше не должны молча дописывать в неё позиции
      clearQuickDraftId(saved.id);

      if (pendingFiles.length > 0) {
        try {
          const uploaded = await api.uploadPhotos(saved.id, pendingFiles);
          commitUploadedPhotos(saved.id, pendingFiles, uploaded);
        } catch (photoErr) {
          console.error("Не удалось загрузить фото:", photoErr);
          const detail = photoErr instanceof Error ? photoErr.message : String(photoErr);
          toast.error(`Запись сохранена, но фото не загрузились: ${detail}`);
        }
      }
      toast.success(status === "draft" ? "Черновик сохранён" : "Запись сохранена");
      if (objectId) {
        navigate({ to: "/objects/$id", params: { id: objectId } });
      } else {
        navigate({ to: "/reports/all" });
      }
    } catch (err) {
      console.error("Не удалось сохранить запись:", err);
      const detail = err instanceof Error ? err.message : String(err);
      toast.error(`Не удалось сохранить запись: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (draftRecordIdRef.current) clearQuickDraftId(draftRecordIdRef.current);

    // Если черновик уже был создан автосохранением в этой сессии — удаляем его,
    // чтобы не оставлять "осиротевшую" запись
    if (!record && createdDraftInSessionRef.current && draftRecordIdRef.current) {
      try {
        await deleteRecord(draftRecordIdRef.current);
      } catch {
        // не удалось удалить — не блокируем отмену для пользователя
      }
    }

    toast("Запись отменена");
    if (objectId) {
      navigate({ to: "/objects/$id", params: { id: objectId } });
    } else {
      navigate({ to: "/" });
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);

    // iOS Safari при capture="environment" + multiple иногда стреляет
    // событием change ДВАЖДЫ подряд для одного и того же снятого фото —
    // из-за этого в черновике появлялись два одинаковых превью. Если тот же
    // набор файлов (по имени+размеру) прилетел повторно в течение 1.5 сек —
    // считаем это дублирующим событием и игнорируем.
    const signature = arr.map((f) => `${f.name}:${f.size}`).join("|");
    const now = Date.now();
    if (signature === lastAddSignatureRef.current && now - lastAddTimeRef.current < 1500) {
      return;
    }
    lastAddSignatureRef.current = signature;
    lastAddTimeRef.current = now;

    const rejected: string[] = [];
    const toProcess: File[] = [];
    for (const f of arr) {
      if (f.size > PHOTO_MAX_RAW_SIZE_BYTES) rejected.push(f.name);
      else toProcess.push(f);
    }
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `Файл «${rejected[0]}» повреждён или слишком большой`
          : `Некоторые файлы повреждены или слишком большие: ${rejected.join(", ")}`,
      );
    }
    if (toProcess.length === 0) return;

    setCompressingPhotos(true);
    const task = (async () => {
      try {
        const compressed = await Promise.all(toProcess.map(compressImage));
        setPendingFiles((prev) => [...prev, ...compressed]);
        setPendingPreviews((prev) => [...prev, ...compressed.map((f) => URL.createObjectURL(f))]);
      } catch {
        // compressImage сама не должна кидать исключений, но на случай
        // непредвиденного сбоя всё равно добавляем оригиналы файлов —
        // фото не должно теряться молча.
        setPendingFiles((prev) => [...prev, ...toProcess]);
        setPendingPreviews((prev) => [...prev, ...toProcess.map((f) => URL.createObjectURL(f))]);
      } finally {
        setCompressingPhotos(false);
      }
    })();
    // Держим последний запущенный процесс сжатия, чтобы save()/autoSaveDraft()
    // могли на него дождаться и не отправить запись раньше, чем фото попадут
    // в pendingFiles (иначе при быстром нажатии «Сохранить» фото терялись).
    compressionPromiseRef.current = task;
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setPendingPreviews((prev) => {
      URL.revokeObjectURL(prev[idx]!);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Удаление уже загруженного на сервер фото (актуально на этапе черновика —
  // фото могло попасть на сервер через автосохранение ещё до финального
  // сохранения записи). Бьём в бэкенд сразу, а не только локально, иначе
  // фото вернётся после следующей синхронизации/обновления страницы.
  const removeUploadedPhoto = async (photoUrlToDelete: string) => {
    const recordId = draftRecordIdRef.current ?? record?.id;
    if (!recordId) return;
    setDeletingPhoto(photoUrlToDelete);
    try {
      await api.deletePhoto(recordId, photoUrlToDelete);
      setPhotos((prev) => {
        const next = prev.filter((p) => p !== photoUrlToDelete);
        setRecordPhotos(recordId, next);
        return next;
      });
    } catch (err) {
      console.error("Не удалось удалить фото:", err);
      const detail = err instanceof Error ? err.message : String(err);
      toast.error(`Не удалось удалить фото: ${detail}`);
    } finally {
      setDeletingPhoto(null);
    }
  };

  // После успешной загрузки на сервер переносим фото из "ожидающих" в
  // "уже сохранённые" и обновляем ГЛОБАЛЬНЫЙ кэш записей — addRecord/
  // updateRecord кладёт в стейт версию записи ДО загрузки фото (фото грузятся
  // отдельным запросом following), так что без этого сохранённая запись
  // выглядела бы без фото на других экранах до следующей синхронизации.
  //
  // ВАЖНО: бэкенд в ответ на загрузку присылает ПОЛНЫЙ список фото записи
  // (все существующие + только что добавленные), а не только новые — так
  // авторитетнее для клиента. Поэтому здесь именно ЗАМЕНЯЕМ photos этим
  // списком, а не добавляем поверх текущего — иначе каждая следующая
  // загрузка задваивала/затраивала все предыдущие фото.
  const commitUploadedPhotos = (
    recordId: string,
    uploadedFiles: File[],
    fullPhotosList: string[],
  ) => {
    setPhotos(fullPhotosList);
    setRecordPhotos(recordId, fullPhotosList);
    let removedIndices: number[] = [];
    setPendingFiles((prevFiles) => {
      const next: File[] = [];
      removedIndices = [];
      prevFiles.forEach((f, i) => {
        if (uploadedFiles.includes(f)) removedIndices.push(i);
        else next.push(f);
      });
      return next;
    });
    setPendingPreviews((prevPreviews) => {
      const next: string[] = [];
      prevPreviews.forEach((url, i) => {
        if (removedIndices.includes(i)) URL.revokeObjectURL(url);
        else next.push(url);
      });
      return next;
    });
  };

  return (
    <>
      <PageHeading
        context={
          record
            ? record.status === "draft"
              ? "Черновик записи"
              : "Редактирование записи"
            : "Новая запись"
        }
        title={object ? `${object.name}, ${object.address}` : "Выберите объект"}
      />

      <div className="mt-5 w-full space-y-5 xl:max-w-5xl 2xl:max-w-none">
        <div>
          <FieldLabel>Дата работ</FieldLabel>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
        </div>

        <div>
          <FieldLabel>Объект</FieldLabel>
          <div className="mt-1">
            <ObjectSelect objects={selectableObjects} value={objectId} onChange={setObjectId} />
          </div>
        </div>

        <div>
          <FieldLabel>Состав записи</FieldLabel>
          <div className="mt-1">
            <EmployeeSelect all={employees} value={selectedEmployees} onChange={applyCrew} />
          </div>
          {brigades.length > 0 && (
            <div className="mt-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) fillFromBrigade(e.target.value);
                }}
                className="w-full rounded-xl border border-dashed border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground"
              >
                <option value="">Заполнить из бригады...</option>
                {brigades.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.members.join(", ")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Виды работ · кто и сколько сделал</FieldLabel>
          <div className="mt-1 space-y-3">
            {items.map((item, idx) => {
              const itemCrew = (item.allocations ?? []).map((a) => a.employee);
              return (
                <div key={idx} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold break-words whitespace-normal">
                      {item.name}
                    </p>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Убрать позицию"
                    >
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Общий объём</span>
                      <NumberField
                        value={itemQty(item)}
                        readOnly={item.manual}
                        onChange={(v) => setItemTotal(idx, v)}
                        className={cn(
                          "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm",
                          item.manual && "text-muted-foreground",
                        )}
                      />
                      <span className="text-muted-foreground">{item.unit}</span>
                    </label>
                    {isAdmin && (
                      <span className="text-sm text-muted-foreground">
                        {item.price.toLocaleString("ru-RU")} ₽ / {item.unit}
                      </span>
                    )}
                    {item.manual && (
                      <button
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? syncItem({ ...it, manual: false }, itemCrew) : it,
                            ),
                          )
                        }
                        className="text-xs font-semibold text-primary"
                      >
                        Разделить поровну
                      </button>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl bg-card p-3">
                    <FieldLabel>Разбивка по сотрудникам</FieldLabel>
                    <div className="mt-2 space-y-2">
                      {(item.allocations ?? []).map((a) => (
                        <div key={a.employee} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-sm break-words">{a.employee}</span>
                          <NumberField
                            value={a.qty}
                            onChange={(v) => setAllocation(idx, a.employee, v)}
                            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
                          />
                          <span className="w-12 text-sm text-muted-foreground">{item.unit}</span>
                        </div>
                      ))}
                      {(item.allocations ?? []).length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Добавьте сотрудников в состав записи.
                        </p>
                      )}
                    </div>
                    <div className="mt-3">
                      <EmployeeSelect
                        all={employees}
                        value={itemCrew}
                        onChange={(next) => setItemCrew(idx, next)}
                        placeholder="Изменить состав"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-primary"
            >
              <Plus className="size-4" />
              {items.length === 0 ? "Выбрать вид работы" : "Ещё вид работы"}
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>Комментарий (необязательно)</FieldLabel>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Добавить примечание..."
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
        </div>

        <div>
          <FieldLabel>Фото</FieldLabel>
          <div className="mt-1 flex gap-2">
            <label
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold",
                compressingPhotos && "pointer-events-none opacity-60",
              )}
            >
              <Camera className="size-4" /> Снять фото
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={compressingPhotos}
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
                compressingPhotos && "pointer-events-none opacity-60",
              )}
            >
              <ImageIcon className="size-4" /> Из галереи
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={compressingPhotos}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {compressingPhotos && (
            <p className="mt-1.5 text-xs text-muted-foreground">Сжимаем фото...</p>
          )}
          {(photos.length > 0 || pendingPreviews.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p} className="relative size-16">
                  <img
                    src={p}
                    alt="Фото к записи"
                    className={cn(
                      "size-16 rounded-lg object-cover",
                      deletingPhoto === p && "opacity-40",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => removeUploadedPhoto(p)}
                    disabled={deletingPhoto === p}
                    aria-label="Удалить фото"
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-0.5 disabled:opacity-60"
                  >
                    <X className="size-3 text-white" />
                  </button>
                </div>
              ))}
              {pendingPreviews.map((p, idx) => (
                <div key={p} className="relative size-16">
                  <img src={p} alt="Новое фото" className="size-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    aria-label="Убрать фото"
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-0.5"
                  >
                    <X className="size-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
            <span className="label-caps">Итого по записи</span>
            <span className="font-mono text-lg font-bold">{total.toLocaleString("ru-RU")} ₽</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleCancel}
            disabled={saving || compressingPhotos}
            className={cn(
              "w-full rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold transition-colors disabled:opacity-60 sm:w-auto sm:px-6",
              hasEnteredData() ? "text-foreground" : "text-muted-foreground",
            )}
          >
            Отменить
          </button>
          <button
            onClick={() => save("draft")}
            disabled={saving || compressingPhotos}
            className="w-full rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold disabled:opacity-60"
          >
            Сохранить черновик
          </button>
          <button
            onClick={() => save("done")}
            disabled={saving || compressingPhotos}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Сохранение..." : compressingPhotos ? "Сжимаем фото..." : "Сохранить запись"}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <WorkTypePicker
          isAdmin={isAdmin}
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            setItems((prev) => [...prev, syncItem(item, crew)]);
            setPickerOpen(false);
          }}
          onRequest={(text) => {
            void (async () => {
              try {
                await createRequest(text);
                toast.success("Заявка отправлена администратору");
                setPickerOpen(false);
              } catch {
                toast.error("Не удалось отправить заявку, попробуйте ещё раз");
              }
            })();
          }}
          types={workTypes}
        />
      )}
    </>
  );
}

function WorkTypePicker({
  types,
  onPick,
  onClose,
  onRequest,
  isAdmin,
}: {
  types: { id: string; name: string; unit: string; price: number }[];
  onPick: (item: WorkItem) => void;
  onClose: () => void;
  onRequest: (text: string) => void;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const filtered = smartFilter(types, query, (t) => t.name);

  // Сворачиваем клавиатуру, как только начинается скролл списка видов
  // работ — иначе она закрывает часть карточек и мешает выбору.
  const listRef = useRef<HTMLDivElement>(null);
  useBlurOnScroll(listRef);

  return (
    <div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4"
    >
      <div className="flex max-h-[95vh] w-full max-w-6xl 2xl:max-w-[1600px] flex-col rounded-t-3xl bg-card shadow-2xl md:rounded-3xl">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 md:px-10 md:pt-10 md:pb-7">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Выбор вида работ</h2>
            <p className="mt-1.5 text-base text-muted-foreground">
              Найдите позицию в справочнике или укажите свой вариант
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-full p-2.5 hover:bg-muted"
          >
            <X className="size-6 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 md:px-10">
          <div className="relative">
            <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию..."
              className="w-full rounded-xl border border-border bg-surface py-4 pr-5 pl-12 text-base"
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span className="label-caps">Справочник</span>
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "позиция" : filtered.length < 5 ? "позиции" : "позиций"}
            </span>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5 md:px-10 md:py-7">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-base text-muted-foreground">Ничего не найдено</p>
              <button
                onClick={() => setCustomOpen(true)}
                className="mt-3 text-base font-semibold text-primary"
              >
                Указать свой вариант
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onPick({ name: t.name, unit: t.unit, qty: 0, price: t.price })}
                    className="group flex h-full w-full flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="block text-base font-semibold leading-snug break-words whitespace-normal group-hover:text-primary">
                      {t.name}
                    </span>
                    <div className="flex w-full items-center justify-between gap-3">
                      {isAdmin && (
                        <span className="font-mono text-sm text-muted-foreground">
                          {t.price.toLocaleString("ru-RU")} ₽ / {t.unit}
                        </span>
                      )}
                      {!isAdmin && <span />}
                      <span className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.unit}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-6 py-5 md:px-10 md:py-7">
          {!customOpen ? (
            <button
              onClick={() => setCustomOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-base font-semibold text-primary transition-colors hover:bg-muted/40"
            >
              <Plus className="size-5" />
              Не нашли нужный вид работы? Указать свой вариант
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Свой вариант</span>
                <button
                  onClick={() => setCustomOpen(false)}
                  className="text-sm text-muted-foreground"
                >
                  Скрыть
                </button>
              </div>
              <textarea
                rows={4}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Опишите недостающие позиции, по одной на строку"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setCustomOpen(false)}
                  className="flex-1 rounded-xl border border-border bg-surface py-3.5 text-base font-semibold"
                >
                  Отмена
                </button>
                <button
                  onClick={() => custom.trim() && onRequest(custom.trim())}
                  className="flex-1 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground"
                >
                  Отправить заявку
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
