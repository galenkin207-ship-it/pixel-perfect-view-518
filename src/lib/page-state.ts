import {
  type ReactNode,
  type SetStateAction,
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

// Состояние страниц на компьютере (фильтры, период, поиск, вкладки, раскрытые
// блоки, страница, прокрутка), чтобы при переходах по левому меню ничего не
// сбрасывалось, — сбрасывается только вручную («Сбросить» на странице или
// «Сбросить все разделы» в настройках).
//
// Только на «desktop» (тот же признак, что у левого меню в AppShell: широкий
// экран + мышь). На телефоне всё как раньше: хук ведёт себя как useState.
//
// sessionStorage: переживает F5 в этой вкладке, умирает с вкладкой. Формат
// версионирован — после деплоя с другим форматом старое молча выкидываем.
// Привязано к пользователю: вошёл другой — начинает с чистого листа.
// Храним только лёгкое (строки, числа, массивы id) — никаких данных/списков.

const STORAGE_KEY = "uchet:page-state:v1";
const DESKTOP_QUERY = "(min-width: 768px) and (pointer: fine)";

type Store = {
  v: 1;
  userId: string | null;
  pages: Record<string, Record<string, unknown>>;
};

const empty = (userId: string | null = null): Store => ({ v: 1, userId, pages: {} });

function load(): Store {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Store> | null;
    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.pages !== "object" ||
      parsed.pages === null ||
      Array.isArray(parsed.pages)
    ) {
      return empty();
    }
    return {
      v: 1,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      pages: parsed.pages,
    };
  } catch {
    return empty();
  }
}

let store: Store = load();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // переполнено/недоступно — живём без сохранения между F5
  }
}

function schedulePersist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flush, 150);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (persistTimer) flush();
  });
}

export function isDesktopNow() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

export function readPageState<T>(page: string, field: string): T | undefined {
  return store.pages[page]?.[field] as T | undefined;
}

export function writePageState(page: string, field: string, value: unknown) {
  const cur = store.pages[page] ?? {};
  if (cur[field] === value) return;
  store.pages[page] = { ...cur, [field]: value };
  schedulePersist();
}

// --- Сброс: версия на страницу, по ней PageStateScope перемонтирует страницу ---
const versions = new Map<string, number>();
let globalVersion = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Сбросить состояние одной страницы (включая прокрутку) и перемонтировать её. */
export function resetPageState(page: string) {
  delete store.pages[page];
  delete store.pages[SCROLL_PAGE]?.[page];
  delete store.pages[NAV_PAGE]?.[page];
  const sections = store.pages[SECTION_PAGE];
  if (sections) {
    for (const [root, sub] of Object.entries(sections)) if (sub === page) delete sections[root];
  }
  versions.set(page, (versions.get(page) ?? 0) + 1);
  schedulePersist();
  emit();
}

/** Забыть прокрутку страницы (сброс без перемонтирования). */
export function forgetScroll(page: string) {
  delete store.pages[SCROLL_PAGE]?.[page];
  schedulePersist();
}

/** «Сбросить все разделы». */
export function resetAllPageState() {
  store = empty(store.userId);
  globalVersion += 1;
  flush();
  emit();
}

/** Выход из аккаунта: стираем всё, включая sessionStorage. */
export function clearPageStateOnLogout() {
  store = empty();
  globalVersion += 1;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

/** Вызывается при входе: состояние другого пользователя не подтягиваем. */
export function bindPageStateUser(userId: string) {
  if (store.userId === userId) return;
  store = empty(userId);
  flush();
}

/**
 * Как useState, но на компьютере значение переживает уход со страницы и F5.
 * page — id страницы (раздела), field — имя поля внутри неё.
 */
export function usePageState<T>(
  // null — не запоминать (обычный useState), например у компонента вне раздела.
  page: string | null,
  field: string,
  initial: T | (() => T),
  // true — не брать сохранённое (например, параметры пришли в URL — они главнее).
  ignoreSaved = false,
): [T, (v: SetStateAction<T>) => void] {
  const [enabled] = useState(() => page !== null && isDesktopNow());
  const [value, setValue] = useState<T>(() => {
    if (enabled && page !== null && !ignoreSaved) {
      const saved = readPageState<T>(page, field);
      if (saved !== undefined) return saved;
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    if (enabled && page !== null) writePageState(page, field, value);
  }, [enabled, page, field, value]);
  const set = useCallback((v: SetStateAction<T>) => setValue(v), []);
  return [value, set];
}

/**
 * Обёртка страницы: после «Сбросить» (resetPageState) или «Сбросить все
 * разделы» перемонтирует содержимое — все usePageState читают уже пустое
 * хранилище и встают в значения по умолчанию.
 */
export function PageStateScope({ page, children }: { page: string; children: ReactNode }) {
  const version = useSyncExternalStore(
    subscribe,
    () => `${globalVersion}:${versions.get(page) ?? 0}`,
    () => "0:0",
  );
  return createElement(Fragment, { key: version }, children);
}

// --- Прокрутка и последний URL раздела (для ссылок левого меню) ---
const SCROLL_PAGE = "__scroll";
const NAV_PAGE = "__nav";

export function readScroll(pathname: string): number | undefined {
  const v = readPageState<number>(SCROLL_PAGE, pathname);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
export function writeScroll(pathname: string, top: number) {
  writePageState(SCROLL_PAGE, pathname, Math.round(top));
}

/** Последние search params раздела — ссылка меню ведёт ровно туда. */
export function readNavSearch(pathname: string): Record<string, unknown> | undefined {
  const v = readPageState<Record<string, unknown>>(NAV_PAGE, pathname);
  return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}
export function writeNavSearch(pathname: string, search: Record<string, unknown>) {
  const prev = readNavSearch(pathname);
  if (prev && JSON.stringify(prev) === JSON.stringify(search)) return;
  writePageState(NAV_PAGE, pathname, search);
}

// --- Последняя подстраница раздела меню (Отчёты → подробный отчёт) ---
const SECTION_PAGE = "__section";

export function readSectionSub(root: string): string | undefined {
  const v = readPageState<string>(SECTION_PAGE, root);
  return typeof v === "string" ? v : undefined;
}
export function writeSectionSub(root: string, path: string) {
  writePageState(SECTION_PAGE, root, path);
}
