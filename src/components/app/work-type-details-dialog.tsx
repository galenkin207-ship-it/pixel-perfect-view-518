import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogType, WorkTypeInfo } from "@/data/work-type-tree";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatGesnNumberLabel } from "@/lib/work-type-format";

const CATALOG_TYPE_LABELS: Record<CatalogType, string> = {
  "новое строительство": "Новое строительство",
  ремонт: "Ремонт",
};

// Кэш сведений по id на время сессии: повторное открытие — мгновенно. Данные
// могут устареть после правки/переноса позиции или переименования раздела —
// справочник вызывает clearWorkTypeInfoCache() после таких изменений.
const infoCache = new Map<string, WorkTypeInfo>();

export function clearWorkTypeInfoCache() {
  infoCache.clear();
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: WorkTypeInfo };

function useWorkTypeInfo(id: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>(() => {
    const cached = infoCache.get(id);
    return cached ? { status: "ready", info: cached } : { status: "loading" };
  });

  useEffect(() => {
    const cached = infoCache.get(id);
    if (cached) {
      setState({ status: "ready", info: cached });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    api
      .getWorkTypeDetails(id)
      .then((info) => {
        infoCache.set(id, info);
        if (!cancelled) setState({ status: "ready", info });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof ApiError && err.status === 404
              ? "Позиция не найдена — возможно, её уже удалили"
              : "Не удалось загрузить сведения",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}

// Пустые значения выводим одинаково во всех строках реквизитов — «—».
const EMPTY = "—";

function formatPrice(info: WorkTypeInfo): string {
  return info.has_price ? `${info.price.toLocaleString("ru-RU")} ₽` : "Цена не задана";
}

// 61.30000 -> «61,3 чел.-ч» (Number убирает хвост нулей).
function formatLaborHours(hours: number | null): string {
  if (hours == null || Number.isNaN(hours)) return EMPTY;
  return `${hours.toLocaleString("ru-RU", { maximumFractionDigits: 5 })} чел.-ч`;
}

function splitComposition(composition: string | null): string[] {
  if (!composition) return [];
  return composition
    .split(/\s+\|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function InfoSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Загрузка сведений">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="contents">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function InfoBody({ info }: { info: WorkTypeInfo }) {
  const composition = splitComposition(info.work_composition);
  const rows: [string, string][] = [
    ["Код ГЭСН", info.gesn_code?.trim() || EMPTY],
    ["Единица", info.unit?.trim() || EMPTY],
    ["Цена", formatPrice(info)],
    ["Трудозатраты", formatLaborHours(info.labor_hours)],
    ["Тип каталога", info.catalog_type ? CATALOG_TYPE_LABELS[info.catalog_type] : EMPTY],
  ];
  return (
    <div className="space-y-5">
      {info.path.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Расположение</h3>
          <ol className="space-y-1 text-sm">
            {info.path.map((node, i) => {
              const number = node.level === 1 ? formatGesnNumberLabel(node.gesn_code) : null;
              return (
                <li
                  key={node.id}
                  style={{ paddingLeft: `${i * 0.75}rem` }}
                  className="flex gap-1.5 leading-snug text-muted-foreground"
                >
                  <span aria-hidden className="shrink-0">
                    →
                  </span>
                  <span className="min-w-0 break-words">{number ? `${number} ${node.name}` : node.name}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section>
        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn("min-w-0 font-semibold break-words", value === EMPTY && "text-muted-foreground")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Состав работ</h3>
        {composition.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-snug marker:text-muted-foreground">
            {composition.map((item, i) => (
              <li key={i} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Состав работ не заполнен</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Материалы</h3>
        <p className="text-sm text-muted-foreground">Материалы пока не подключены</p>
      </section>
    </div>
  );
}

// Модалка «Сведения» о позиции справочника (admin/curator, десктоп): только
// чтение, одно действие — «Закрыть». title — название с карточки, показывается
// пока идёт загрузка; после неё — полное name из ответа. Тело скроллится
// внутри (шапка и кнопка — shrink-0, min-h-0 у прокручиваемой области).
export function WorkTypeDetailsDialog({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const { state, retry } = useWorkTypeInfo(id);
  const info = state.status === "ready" ? state.info : null;
  const isGesn = info?.source === "gesn_catalog";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <DialogTitle className="min-w-0 flex-1 text-base leading-snug break-words">
            {info?.name ?? title}
          </DialogTitle>
          {info && (
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                isGesn ? "bg-muted text-muted-foreground" : "bg-status-review-soft text-status-review",
              )}
            >
              {isGesn ? "ГЭСН" : "Наш"}
            </span>
          )}
        </div>
        <DialogDescription className="sr-only">
          Расположение, реквизиты и состав работ позиции справочника
        </DialogDescription>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {state.status === "loading" && <InfoSkeleton />}
          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>{state.message}</p>
              <button
                type="button"
                onClick={retry}
                className="rounded-xl border border-border bg-surface px-4 py-2 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Повторить
              </button>
            </div>
          )}
          {info && <InfoBody info={info} />}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Закрыть
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
