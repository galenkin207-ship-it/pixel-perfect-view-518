/**
 * "Быстрый черновик" — запись, которую пользователь собирает свайпами по видам
 * работ ещё до того, как открыл карточку записи (объект, дата и т.д. ещё не
 * выбраны). Id такого черновика хранится в localStorage браузера, чтобы разные
 * свайпы на странице "Все виды работ" добавляли позиции в одну и ту же запись,
 * а не создавали новую на каждый свайп.
 */

const STORAGE_KEY = "uchet:quick-draft-id";

export function getQuickDraftId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setQuickDraftId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — просто не запомним между страницами
  }
}

/** Если передан id — очищает указатель, только если он совпадает (не затирает чужой более новый черновик). */
export function clearQuickDraftId(id?: string) {
  try {
    if (id && localStorage.getItem(STORAGE_KEY) !== id) return;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
