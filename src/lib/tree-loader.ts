import type { CatalogType, WorkTypeTreeNode } from "@/data/work-type-tree";

// Загрузчик списков детей дерева видов работ (GET /work-types/tree) для каскада:
// кэш по родителю, дедупликация запросов в полёте, приоритеты и отмена.
//  - Один и тот же ключ (родитель) во время ожидания получает один и тот же
//    Promise; готовый результат из кэша повторно не запрашивается.
//  - "high" — то, что нужно для показа на экране (колонка после клика): стартует
//    сразу. "low" — предзагрузка при наведении: не стартует, пока идёт хоть один
//    "high", и не больше maxLow одновременно.
//  - Запрос отменяется (AbortController), когда его никто не ждёт: пользователь
//    ушёл в другую ветку или убрал курсор. Отмена отложена на такт — эффект,
//    который тут же подписывается на тот же ключ заново, запрос не теряет.

export type TreeParams = { type: CatalogType } | { parentId: string };
export type TreePriority = "high" | "low";
export type TreeHandle = { promise: Promise<WorkTypeTreeNode[]>; release: () => void };

// Ключ кэша и колонки: "type:<каталог>" либо "parent:<id>".
export function treeKey(params: TreeParams): string {
  return "type" in params ? `type:${params.type}` : `parent:${params.parentId}`;
}

export function paramsFromKey(key: string): TreeParams {
  return key.startsWith("type:")
    ? { type: key.slice("type:".length) as CatalogType }
    : { parentId: key.slice("parent:".length) };
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

type Entry = {
  key: string;
  params: TreeParams;
  priority: TreePriority;
  state: "queued" | "running";
  refs: number;
  controller: AbortController;
  promise: Promise<WorkTypeTreeNode[]>;
  resolve: (nodes: WorkTypeTreeNode[]) => void;
  reject: (err: unknown) => void;
  releaseTimer: ReturnType<typeof setTimeout> | undefined;
};

export class TreeLoader {
  readonly cache = new Map<string, WorkTypeTreeNode[]>();
  private inflight = new Map<string, Entry>();
  private queue: Entry[] = [];
  private running = new Set<Entry>();
  // Отладка (только dev): сколько запросов tree ушло после клика.
  private session: { label: string; total: number; high: number; low: number } | null = null;
  private sessionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private fetcher: (params: TreeParams, signal: AbortSignal) => Promise<WorkTypeTreeNode[]>,
    // Вызывается при любом изменении кэша (перерисовать колонки).
    private onChange: () => void,
    private maxLow = 2,
  ) {}

  // fresh — мимо кэша и мимо запроса в полёте (после записи: уже идущий запрос
  // мог начаться до неё и вернуть старые данные). Новый запрос вытесняет старый
  // в таблице запросов; ответ старого в кэш не попадает.
  load(params: TreeParams, { priority = "high", fresh = false }: { priority?: TreePriority; fresh?: boolean } = {}): TreeHandle {
    const key = treeKey(params);
    if (!fresh) {
      const cached = this.cache.get(key);
      if (cached) return { promise: Promise.resolve(cached), release() {} };
      const existing = this.inflight.get(key);
      if (existing) return this.subscribe(existing, priority);
    }
    return this.subscribe(this.create(key, params, priority), priority);
  }

  // Мгновенно обновить кэш вручную (removeNode и т.п.).
  setCache(key: string, nodes: WorkTypeTreeNode[]) {
    this.cache.set(key, nodes);
    this.onChange();
  }

  dropCache(key: string) {
    this.cache.delete(key);
  }

  // Отменить всё и очистить кэш (сменился режим загрузки).
  reset() {
    for (const entry of new Set([...this.inflight.values(), ...this.queue, ...this.running])) {
      clearTimeout(entry.releaseTimer);
      entry.controller.abort();
      entry.reject(abortError());
    }
    this.inflight.clear();
    this.queue = [];
    this.running.clear();
    this.cache.clear();
  }

  // Dev-замер: клик по узлу начинает "сеанс", по его завершении (всё утихло)
  // в консоль пишется число запросов tree.
  debugClick(label: string) {
    if (!import.meta.env.DEV) return;
    this.flushSession();
    this.session = { label, total: 0, high: 0, low: 0 };
    clearTimeout(this.sessionTimer);
    // 400 мс — окно, за которое успевают стартовать запросы после клика; сеанс
    // закрывается, когда оно прошло и всё утихло.
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = undefined;
      this.flushIfIdle();
    }, 400);
  }

  private subscribe(entry: Entry, priority: TreePriority): TreeHandle {
    entry.refs += 1;
    clearTimeout(entry.releaseTimer);
    if (priority === "high" && entry.priority === "low") {
      entry.priority = "high";
      if (entry.state === "queued") {
        this.queue = this.queue.filter((e) => e !== entry);
        this.start(entry);
      }
    }
    let released = false;
    return {
      promise: entry.promise,
      release: () => {
        if (released) return;
        released = true;
        entry.refs -= 1;
        if (entry.refs <= 0) entry.releaseTimer = setTimeout(() => this.abortIfUnused(entry), 0);
      },
    };
  }

  private create(key: string, params: TreeParams, priority: TreePriority): Entry {
    let resolve!: Entry["resolve"];
    let reject!: Entry["reject"];
    const promise = new Promise<WorkTypeTreeNode[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Отклонение без единого слушателя (все ушли) не должно попадать в консоль.
    promise.catch(() => {});
    const entry: Entry = {
      key,
      params,
      priority,
      state: "queued",
      refs: 0,
      controller: new AbortController(),
      promise,
      resolve,
      reject,
      releaseTimer: undefined,
    };
    this.inflight.set(key, entry);
    if (priority === "high") this.start(entry);
    else {
      this.queue.push(entry);
      this.pump();
    }
    return entry;
  }

  private start(entry: Entry) {
    entry.state = "running";
    this.running.add(entry);
    if (this.session) {
      this.session.total += 1;
      this.session[entry.priority] += 1;
    }
    this.fetcher(entry.params, entry.controller.signal)
      .then(
        (nodes) => {
          // Вытесненный fresh-запросом ответ в кэш не кладём.
          if (this.inflight.get(entry.key) === entry) {
            this.inflight.delete(entry.key);
            this.cache.set(entry.key, nodes);
          }
          entry.resolve(nodes);
          this.onChange();
        },
        (err) => {
          if (this.inflight.get(entry.key) === entry) this.inflight.delete(entry.key);
          entry.reject(err);
        },
      )
      .finally(() => {
        this.running.delete(entry);
        this.pump();
        this.flushIfIdle();
      });
  }

  // Предзагрузка стартует, только пока нет ни одного "high" и не больше maxLow.
  private pump() {
    while (this.queue.length > 0) {
      const all = [...this.running];
      if (all.some((e) => e.priority === "high")) return;
      if (all.filter((e) => e.priority === "low").length >= this.maxLow) return;
      this.start(this.queue.shift()!);
    }
  }

  private abortIfUnused(entry: Entry) {
    if (entry.refs > 0) return;
    if (entry.state === "queued") {
      this.queue = this.queue.filter((e) => e !== entry);
      if (this.inflight.get(entry.key) === entry) this.inflight.delete(entry.key);
      entry.reject(abortError());
    } else {
      entry.controller.abort();
    }
  }

  private flushIfIdle() {
    if (this.session && this.running.size === 0 && this.queue.length === 0 && !this.sessionTimer) this.flushSession();
  }

  private flushSession() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearTimeout(this.sessionTimer);
    this.sessionTimer = undefined;
    console.debug(
      `[tree] клик «${s.label}»: запросов tree = ${s.total} (колонка: ${s.high}, предзагрузка: ${s.low})`,
    );
  }
}
