import { useNavigate } from "@tanstack/react-router";
import { Camera, ChevronLeft, Image as ImageIcon, Plus, Search, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { FieldLabel, PageHeading } from "@/components/app/bits";
import { EmployeeSelect } from "@/components/app/employee-select";
import { NumberField } from "@/components/app/number-field";
import { ObjectSelect } from "@/components/app/object-select";
import { WorkTypeAiSearchButton, WorkTypeAiSearchPanel } from "@/components/app/work-type-ai-search";
import { WorkTypeCascade } from "@/components/app/work-type-cascade";
import { composeCounterName, computeCounterTotal, WorkTypeCounterCard } from "@/components/app/work-type-counter-card";
import { WorkTypeSearchResults, WorkTypeSearchResultsSkeleton } from "@/components/app/work-type-search-results";
import { useBlurOnScroll } from "@/hooks/use-blur-on-scroll";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModalClose } from "@/hooks/use-modal-close";
import { useWorkTypeAiSearch } from "@/hooks/use-work-type-ai-search";
import { useWorkTypeCascade } from "@/hooks/use-work-type-cascade";
import { useWorkTypeSearch } from "@/hooks/use-work-type-search";
import { cn, objectLabel } from "@/lib/utils";
import { itemQty, recordTotal, round2, syncItem } from "@/lib/record-utils";
import { api, photoThumbUrl } from "@/lib/api-client";
import { clearQuickDraftId } from "@/lib/quick-draft";
import type { WorkItem, WorkRecord } from "@/data/mock";
import type {
  CatalogType,
  WorkTypeCounterStep,
  WorkTypeSearchResult,
  WorkTypeTreeNode,
} from "@/data/work-type-tree";
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
// ВАЖНО: должно совпадать с PHOTO_MAX_FILE_SIZE_BYTES на бэкенде
// (uchet-backend/src/routes/records.js, multer limits.fileSize). Раньше тут
// стояло 30 МБ, а на бэкенде — 15 МБ: несжимаемый HEIC (см. compressImage
// ниже — HEIC не проходит через canvas и уходит на сервер как есть) с
// современного телефона проходил эту проверку, но падал на сервере с
// невнятной ошибкой, и заодно валил весь пакет фото в том же запросе,
// включая остальные нормальные снимки.
const PHOTO_MAX_RAW_SIZE_BYTES = 30 * 1024 * 1024;
// Должно совпадать с ALLOWED_EXT на бэкенде. Раньше клиент вообще не
// проверял тип файла — если из галереи прилетало что-то не-изображение
// (видео, live-photo и т.п., бывает на некоторых прошивках Android даже
// при accept="image/*"), сервер молча пропускал его (continue) без единого
// сообщения пользователю — отсюда "не все фото присутствуют".
const PHOTO_ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
// ВАЖНО: должно совпадать с PHOTO_MAX_PER_RECORD на бэкенде
// (uchet-backend/src/routes/records.js). Проверяем и на клиенте, чтобы
// мастер узнавал о лимите сразу при выборе фото, а не только после неудачной
// попытки автосохранения записи с уже выбранными снимками.
const PHOTO_MAX_PER_RECORD = 30;

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
  returnTo,
  returnSearch,
}: {
  record?: WorkRecord;
  defaultObjectId?: string;
  // См. records.$id.tsx — необязательный "обратный адрес" после сохранения/
  // отмены/удаления записи, чтобы вернуться туда, откуда открыли
  // редактирование (сейчас — /reports/all с восстановлением её фильтров),
  // а не на страницу объекта по умолчанию.
  returnTo?: string;
  returnSearch?: string;
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

  const isAdminLike = role === "admin" || role === "curator";

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
  // Введённые значения счётчиков (step-counter), по id базовой позиции —
  // сохраняются, пока открыта эта форма записи (не сбрасываются при
  // закрытии/повторном открытии модалки выбора вида работ внутри одной
  // сессии формы), но обнуляются вместе с новым монтированием RecordForm
  // (новая запись/новый черновик).
  const counterValuesRef = useRef(new Map<string, Record<string, number>>());
  const lastAddSignatureRef = useRef<string | null>(null);
  const lastAddTimeRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const [dateIso, setDateIso] = useState(() => toIso(record?.date));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);

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
          commitUploadedPhotos(saved.id, filesToUpload, uploaded.photos, uploaded.skipped);
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

  // Куда переходить после сохранения/отмены/удаления записи. Если форма была
  // открыта с явным "обратным адресом" (returnTo, сейчас — только со страницы
  // "Все записи") — возвращаемся туда с восстановлением её фильтров вместо
  // перехода на страницу объекта. Иначе — прежнее поведение по умолчанию.
  const navigateAfterAction = (fallbackWhenNoObject: "/reports/all" | "/") => {
    if (returnTo === "reports-all") {
      let parsedSearch: Record<string, unknown> = {};
      if (returnSearch) {
        try {
          parsedSearch = JSON.parse(returnSearch);
        } catch {
          parsedSearch = {};
        }
      }
      navigate({ to: "/reports/all", search: parsedSearch as never });
      return;
    }
    if (objectId) {
      navigate({ to: "/objects/$id", params: { id: objectId } });
    } else {
      navigate({ to: fallbackWhenNoObject });
    }
  };

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
          commitUploadedPhotos(saved.id, pendingFiles, uploaded.photos, uploaded.skipped);
        } catch (photoErr) {
          console.error("Не удалось загрузить фото:", photoErr);
          const detail = photoErr instanceof Error ? photoErr.message : String(photoErr);
          toast.error(`Запись сохранена, но фото не загрузились: ${detail}`);
        }
      }
      toast.success(status === "draft" ? "Черновик сохранён" : "Запись сохранена");
      navigateAfterAction("/reports/all");
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
    navigateAfterAction("/");
  };

  // Явное удаление уже сохранённой записи (кнопка «Удалить» рядом с «Отменить»).
  // В отличие от handleCancel, здесь всегда безвозвратно удаляем саму запись —
  // доступно только при редактировании уже существующей записи (record задан).
  const handleDeleteRecord = async () => {
    if (!record) return;
    setDeletingRecord(true);
    try {
      await deleteRecord(record.id);
      clearQuickDraftId(record.id);
      toast.success("Запись удалена");
      navigateAfterAction("/");
    } catch {
      toast.error("Не удалось удалить запись");
      setDeletingRecord(false);
      setConfirmingDelete(false);
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

    const tooLarge: string[] = [];
    const unsupported: string[] = [];
    const toProcess: File[] = [];
    for (const f of arr) {
      if (f.size > PHOTO_MAX_RAW_SIZE_BYTES) tooLarge.push(f.name);
      else if (!PHOTO_ALLOWED_EXT.test(f.name)) unsupported.push(f.name);
      else toProcess.push(f);
    }
    if (tooLarge.length > 0) {
      const mb = Math.round(PHOTO_MAX_RAW_SIZE_BYTES / (1024 * 1024));
      toast.error(
        tooLarge.length === 1
          ? `Файл «${tooLarge[0]}» слишком большой (максимум ${mb} МБ)`
          : `Слишком большие файлы (максимум ${mb} МБ): ${tooLarge.join(", ")}`,
      );
    }
    if (unsupported.length > 0) {
      toast.error(
        unsupported.length === 1
          ? `Файл «${unsupported[0]}» не поддерживается (нужен JPG, PNG, WEBP или HEIC)`
          : `Не поддерживаются (нужен JPG, PNG, WEBP или HEIC): ${unsupported.join(", ")}`,
      );
    }
    if (toProcess.length === 0) return;

    // Тот же лимит, что и на бэкенде — сообщаем сразу, а не после неудачного
    // автосохранения записи с уже выбранными фото.
    const currentCount = photos.length + pendingFiles.length;
    const roomLeft = PHOTO_MAX_PER_RECORD - currentCount;
    if (roomLeft <= 0) {
      toast.error(`Достигнут лимит ${PHOTO_MAX_PER_RECORD} фото на запись`);
      return;
    }
    if (toProcess.length > roomLeft) {
      toast.error(
        `Можно добавить ещё максимум ${roomLeft} фото (лимит ${PHOTO_MAX_PER_RECORD} на запись) — добавлены первые ${roomLeft}`,
      );
      toProcess.length = roomLeft;
    }

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
    skippedNames: string[] = [],
  ) => {
    setPhotos(fullPhotosList);
    setRecordPhotos(recordId, fullPhotosList);
    let removedIndices: number[] = [];
    setPendingFiles((prevFiles) => {
      const next: File[] = [];
      removedIndices = [];
      prevFiles.forEach((f, i) => {
        // Файлы, которые сервер пропустил (неподдерживаемый формат или не
        // удалось сохранить), оставляем среди pendingFiles — иначе они
        // молча пропадали бы и из "ещё не отправлено", и из "уже
        // загружено", хотя пользователь их так и не увидел бы в записи.
        if (uploadedFiles.includes(f) && !skippedNames.includes(f.name)) removedIndices.push(i);
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
    if (skippedNames.length > 0) {
      toast.error(
        skippedNames.length === 1
          ? `Файл «${skippedNames[0]}» не удалось загрузить — попробуйте другой формат (JPG/PNG/HEIC)`
          : `Не удалось загрузить: ${skippedNames.join(", ")} — попробуйте другой формат (JPG/PNG/HEIC)`,
      );
    }
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
        title={object ? objectLabel(object.name, object.address) : "Выберите объект"}
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
                    {isAdminLike && (
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
                    src={photoThumbUrl(p)}
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

        {isAdminLike && (
          <div className="flex items-baseline justify-between rounded-xl bg-surface px-4 py-3">
            <span className="label-caps">Итого по записи</span>
            <span className="font-mono text-lg font-bold">{total.toLocaleString("ru-RU")} ₽</span>
          </div>
        )}

        {record && confirmingDelete && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-foreground">
              Удалить эту запись без возможности восстановления?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleDeleteRecord}
                disabled={deletingRecord}
                className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {deletingRecord ? "Удаление..." : "Да, удалить"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deletingRecord}
                className="flex-1 rounded-lg bg-surface py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
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
          {record && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving || compressingPhotos || deletingRecord}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-surface py-3.5 text-sm font-semibold text-destructive transition-colors disabled:opacity-60 sm:w-auto sm:px-6"
            >
              <Trash2 className="size-4" />
              Удалить
            </button>
          )}
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
          isAdminLike={isAdminLike}
          counterValuesRef={counterValuesRef}
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
  isAdminLike,
  counterValuesRef,
}: {
  types: { id: string; name: string; unit: string; price: number }[];
  onPick: (item: WorkItem) => void;
  onClose: () => void;
  onRequest: (text: string) => void;
  isAdminLike: boolean;
  counterValuesRef: MutableRefObject<Map<string, Record<string, number>>>;
}) {
  const [query, setQuery] = useState("");
  const { results: searchResults, loading: searchLoading } = useWorkTypeSearch(query);
  const ai = useWorkTypeAiSearch(query);
  const [catalogType, setCatalogType] = useState<CatalogType | null>(null);
  const cascade = useWorkTypeCascade(catalogType);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const customRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const { closing, requestClose } = useModalClose(onClose);

  // В запись идёт полное название позиции как в справочнике (leaf.name): его
  // собирает сервер (группа + вариант, с защитой от дублей), склеивать заново
  // на клиенте не нужно.
  function handlePickLeaf(node: WorkTypeTreeNode | WorkTypeSearchResult) {
    onPick({
      name: node.name,
      unit: node.unit,
      qty: 0,
      price: node.price,
      work_type_id: node.id,
    });
  }

  // Базовая позиция со связанными шаговыми модификаторами (is_counter_step,
  // см. GET /api/work-types/:baseId/counter-steps) — вместо мгновенного
  // коммита открываем карточку-счётчик.
  const [counterBase, setCounterBase] = useState<{ base: WorkTypeTreeNode } | null>(null);
  const [counterSteps, setCounterSteps] = useState<WorkTypeCounterStep[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const counterStepsCacheRef = useRef(new Map<string, WorkTypeCounterStep[]>());

  useEffect(() => {
    if (!counterBase) return;
    const saved = counterValuesRef.current.get(counterBase.base.id);
    setCounts(saved ? { ...saved } : {});
  }, [counterBase, counterValuesRef]);

  useEffect(() => {
    if (!counterBase) {
      setCounterSteps(null);
      return;
    }
    const baseId = counterBase.base.id;
    const cached = counterStepsCacheRef.current.get(baseId);
    if (cached) {
      setCounterSteps(cached);
      return;
    }
    setCounterSteps(null);
    let cancelled = false;
    api
      .getWorkTypeCounterSteps(baseId)
      .then((steps) => {
        counterStepsCacheRef.current.set(baseId, steps);
        if (!cancelled) setCounterSteps(steps);
      })
      .catch(() => {
        if (!cancelled) setCounterSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [counterBase]);

  function changeCounterValue(stepId: string, delta: number) {
    if (!counterBase) return;
    setCounts((prev) => {
      const next = { ...prev, [stepId]: Math.max(0, (prev[stepId] ?? 0) + delta) };
      counterValuesRef.current.set(counterBase.base.id, next);
      return next;
    });
  }

  function handleConfirmCounter() {
    if (!counterBase || !counterSteps) return;
    const baseText = counterBase.base.name;
    onPick({
      name: composeCounterName(baseText, counterSteps, counts),
      unit: counterBase.base.unit,
      qty: 0,
      price: computeCounterTotal(counterBase.base, counterSteps, counts),
      work_type_id: counterBase.base.id,
    });
    setCounterBase(null);
  }

  // Точка входа для любого пути, ведущего к выбору листа (обычный клик по
  // листу в колонке, или auto-skip, разрешившийся до листа) — если у листа
  // есть свои шаговые модификаторы, вместо мгновенного коммита открываем
  // счётчик.
  function pickOrOpenCounter(node: WorkTypeTreeNode | WorkTypeSearchResult) {
    if (node.has_counter_steps) {
      setCounterBase({ base: node });
      return;
    }
    handlePickLeaf(node);
  }

  // «Отправить заявку админу» из «Поиск ИИ» — тот же блок «Свой вариант»
  // внизу (заявка администратору), с поисковым запросом в тексте.
  function openRequestFromAi(q: string) {
    setCustom(q);
    setCustomOpen(true);
    requestAnimationFrame(() => {
      customRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      customRef.current?.focus();
    });
  }

  function handleBack() {
    if (!cascade.back()) setCatalogType(null);
  }

  function handleChangeType() {
    setCatalogType(null);
    cascade.reset();
  }

  const isSearching = query.trim().length > 0;
  // Desktop Finder-style каскад (ряд независимо скроллящихся колонок) — в
  // этом режиме общий listRef НЕ должен сам скроллиться по вертикали
  // (иначе все колонки физически шарят один scrollTop, см. историю бага) —
  // вместо этого высота у него ограничена (overflow-y-hidden), а скроллит
  // себя каждая колонка отдельно. В остальных режимах (поиск, счётчик,
  // выбор типа) listRef скроллится как обычно, единым блоком.
  const isDesktopCascade = !isMobile && !counterBase && !isSearching && catalogType !== null;
  // Сворачиваем клавиатуру, как только начинается скролл списка видов
  // работ — иначе она закрывает часть карточек и мешает выбору.
  const listRef = useRef<HTMLDivElement>(null);
  useBlurOnScroll(listRef);

  // Портал в document.body — иначе на iOS этот fixed-оверлей рендерится
  // внутри прокручиваемого #app-scroll-container и нижнее мобильное меню
  // может остаться поверх него (баг WebKit, на Android не проявляется).
  return createPortal(
    <motion.div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {/* Высота фиксированная (весь экран; на мобильном — за вычетом
          safe area сверху, снизу отступ под Home Indicator), а не по
          содержимому: модалка не «прыгает» при смене числа результатов и
          при переключении обычный поиск / «Поиск ИИ». Скроллится только
          список внутри (listRef). */}
      <motion.div
        className="flex h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] w-full max-w-7xl 2xl:max-w-[1800px] flex-col rounded-t-3xl bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl md:h-[calc(100dvh-2rem)] md:rounded-3xl md:pb-0"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: closing ? 0 : 1, y: closing ? 16 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {/* Компактная шапка: заголовок и подзаголовок в одну строку (по
            baseline), подзаголовок скрыт на узких экранах — здесь и в
            поисковой строке ниже вертикальные отступы сознательно урезаны,
            чтобы отдать максимум высоты модалки под сами колонки каскада
            (см. ниже) — это самая важная и самая "голодная" по месту часть
            экрана. Кнопка закрытия оставлена на прежнем размере (size-6 +
            p-2.5 = не меньше 44px тач-таргета). */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 md:px-8 md:pt-5 md:pb-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-lg font-bold md:text-2xl">Выбор вида работ</h2>
            <p className="hidden truncate text-xs text-muted-foreground sm:block md:text-sm">
              Найдите позицию в справочнике или укажите свой вариант
            </p>
          </div>
          <button
            onClick={requestClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-full p-2.5 transition-colors duration-150 ease-out hover:bg-muted"
          >
            <X className="size-6 text-muted-foreground" />
          </button>
        </div>

        {!counterBase && (
          <div className="px-4 md:px-8">
            <div className="flex gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по названию..."
                  className="w-full rounded-xl border border-border bg-surface py-3 pr-5 pl-12 text-base"
                />
              </div>
              <WorkTypeAiSearchButton
                query={query}
                loading={ai.state.status === "loading"}
                onRun={(q) => void ai.run(q)}
              />
            </div>
            {isSearching && !ai.active && (
              <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                <span className="label-caps">Справочник</span>
                <span>
                  {searchLoading
                    ? "Поиск..."
                    : `${searchResults?.length ?? 0} ${
                        (searchResults?.length ?? 0) === 1
                          ? "позиция"
                          : (searchResults?.length ?? 0) < 5
                            ? "позиции"
                            : "позиций"
                      }`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* В desktop-каскаде listRef намеренно НЕ скроллится сам по
            вертикали (overflow-y-hidden) — иначе все колонки физически
            шарили бы один scrollTop, и проскроленная длинная колонка
            утаскивала бы за собой видимую область остальных, включая
            свежеоткрытую короткую. Каждая колонка скроллится независимо
            (см. work-type-cascade-column.tsx) в границах уже ограниченной
            здесь по высоте области. В остальных режимах (поиск, счётчик,
            выбор типа каталога) — обычный overflow-y-auto как раньше.

            КРИТИЧНО: в cascade-режиме listRef ещё и сам должен быть
            flex-контейнером (flex flex-col), а не просто flex-item с
            flex-1 — иначе дочерний div с "h-full" не может определить
            свою высоту: computed height у listRef остаётся 'auto' (даже
            если по факту после flex-grow у него есть конкретный
            результирующий размер), а CSS-проценты у h-full резолвятся
            только против явно заданной/flex-контейнером высоты родителя,
            не против произвольного flex-item. Подтверждено эмпирически
            через headless Chromium (getComputedStyle): без flex flex-col
            здесь contentDiv раздувался по контенту вместо 663px родителя. */}
        <div
          ref={listRef}
          className={cn(
            "flex-1 overflow-x-hidden px-4 py-3 md:px-8 md:py-4",
            isDesktopCascade ? "flex flex-col overflow-y-hidden" : "overflow-y-auto",
          )}
        >
          {counterBase ? (
            <WorkTypeCounterCard
              base={counterBase.base}
              baseText={counterBase.base.name}
              steps={counterSteps}
              counts={counts}
              isAdminLike={isAdminLike}
              onChangeCount={changeCounterValue}
              onConfirm={handleConfirmCounter}
              onBack={() => setCounterBase(null)}
            />
          ) : isSearching && ai.state.status !== "idle" ? (
            <WorkTypeAiSearchPanel
              state={ai.state}
              onClose={ai.reset}
              onRequest={openRequestFromAi}
              renderResults={(results) => (
                <WorkTypeSearchResults
                  results={results}
                  isAdminLike={isAdminLike}
                  onPick={(t) => pickOrOpenCounter(t)}
                />
              )}
            />
          ) : isSearching ? (
            searchLoading ? (
              <WorkTypeSearchResultsSkeleton />
            ) : (searchResults?.length ?? 0) === 0 ? (
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
              <WorkTypeSearchResults
                results={searchResults!}
                isAdminLike={isAdminLike}
                onPick={(t) => pickOrOpenCounter(t)}
              />
            )
          ) : catalogType === null ? (
            <div className="flex h-full flex-col items-stretch justify-center gap-4 sm:flex-row">
              <button
                onClick={() => setCatalogType("новое строительство")}
                className="flex-1 rounded-2xl border border-border bg-surface p-10 text-center text-lg font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                Строительство
              </button>
              <button
                onClick={() => setCatalogType("ремонт")}
                className="flex-1 rounded-2xl border border-border bg-surface p-10 text-center text-lg font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                Ремонт
              </button>
            </div>
          ) : (
            <div className={cn("flex flex-col gap-2", isDesktopCascade && "flex-1 min-h-0")}>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleChangeType}
                  className="flex items-center gap-1 py-1 text-sm font-semibold text-primary"
                >
                  <ChevronLeft className="size-4" />
                  Сменить тип
                </button>
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 py-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                  Назад
                </button>
              </div>

              <WorkTypeCascade
                cascade={cascade}
                mode="select"
                isMobile={isMobile}
                isAdminLike={isAdminLike}
                onLeaf={(leaf) => pickOrOpenCounter(leaf)}
              />
            </div>
          )}
        </div>

        {!counterBase && (
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
                  ref={customRef}
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
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
