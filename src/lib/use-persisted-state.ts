import { useEffect, useState } from "react";

const PREFIX = "uchet:filters:";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Прямая замена useState<T> — тот же тип возврата [value, setValue],
// но значение переживает переходы между страницами и перезагрузку
// вкладки (хранится в localStorage под ключом `uchet:filters:${key}`).
// key должен быть уникален в рамках всего приложения (например
// "reports-all:date-from", "settings:work-types:query").
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial));

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // сохранение — это удобство, а не критичная функциональность;
      // тихо игнорируем (переполнение квоты и т.п.)
    }
  }, [key, value]);

  return [value, setValue] as const;
}
