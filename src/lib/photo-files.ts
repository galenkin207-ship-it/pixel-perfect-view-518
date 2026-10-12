import { toast } from "sonner";

// Общие для формы записи и «Фото за день» проверки и сжатие фото перед
// отправкой на сервер.

// Как в старом приложении: фото сжимаются на телефоне перед отправкой, чтобы
// не гонять по мобильной сети тяжёлые снимки с камеры (10-15 МБ HEIC/JPEG).
// PHOTO_TARGET_SIZE_BYTES — ориентир, до которого пытаемся ужать (не гарантия).
const PHOTO_TARGET_SIZE_BYTES = 450 * 1024; // ~450 КБ
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_MIN_QUALITY = 0.4;
// ВАЖНО: должно совпадать с PHOTO_MAX_FILE_SIZE_BYTES на бэкенде
// (uchet-backend/src/photo-storage.js — общий лимит multer для фото записей
// и фото-отчётов). Несжимаемый HEIC (см. compressImage ниже — HEIC не
// проходит через canvas и уходит на сервер как есть) крупнее лимита сервер
// отклонил бы целым запросом, поэтому отсекаем такие файлы ещё при выборе.
export const PHOTO_MAX_RAW_SIZE_BYTES = 30 * 1024 * 1024;
// Должно совпадать с ALLOWED_EXT на бэкенде. Раньше клиент вообще не
// проверял тип файла — если из галереи прилетало что-то не-изображение
// (видео, live-photo и т.п., бывает на некоторых прошивках Android даже
// при accept="image/*"), сервер молча пропускал его (continue) без единого
// сообщения пользователю — отсюда "не все фото присутствуют".
const PHOTO_ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export async function compressImage(file: File): Promise<File> {
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

// iOS Safari при capture="environment" иногда стреляет событием change ДВАЖДЫ
// подряд для одного и того же снятого фото — из-за этого появлялись два
// одинаковых превью. Если тот же набор файлов (по имени+размеру) прилетел
// повторно в течение 1.5 сек — считаем это дублирующим событием.
export function createRepeatedSelectionGuard() {
  let lastSignature: string | null = null;
  let lastTime = 0;
  return (files: File[]) => {
    const signature = files.map((f) => `${f.name}:${f.size}`).join("|");
    const now = Date.now();
    if (signature === lastSignature && now - lastTime < 1500) return true;
    lastSignature = signature;
    lastTime = now;
    return false;
  };
}

// Отсеивает слишком большие и неподдерживаемые файлы (с тостами), возвращает
// годные к сжатию и отправке.
export function filterAcceptablePhotos(files: File[]): File[] {
  const tooLarge: string[] = [];
  const unsupported: string[] = [];
  const ok: File[] = [];
  for (const f of files) {
    if (f.size > PHOTO_MAX_RAW_SIZE_BYTES) tooLarge.push(f.name);
    else if (!PHOTO_ALLOWED_EXT.test(f.name)) unsupported.push(f.name);
    else ok.push(f);
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
  return ok;
}
