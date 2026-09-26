import type { ReactNode } from "react";
import { FilePlus2, Loader2, Sparkles, Wand2, X } from "lucide-react";

import { WorkTypeSearchResultsSkeleton } from "@/components/app/work-type-search-results";
import type { WorkTypeSearchResult } from "@/data/work-type-tree";
import type { WorkTypeAiSearchState } from "@/hooks/use-work-type-ai-search";
import { cn } from "@/lib/utils";

// Кнопка «Поиск ИИ» рядом с полем поиска (справа, в одну строку). На
// десктопе — иконка с подписью, на мобильном — компактная иконка «волшебная
// палочка» (ширину задаёт className). Активна, когда в поле есть текст; во
// время запроса — спиннер, но кнопка не блокируется: повторный клик
// перезапускает поиск с новым текстом.
export function WorkTypeAiSearchButton({
  query,
  loading,
  onRun,
  className,
}: {
  query: string;
  loading: boolean;
  onRun: (query: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onRun(query)}
      disabled={!query.trim()}
      aria-label="Поиск ИИ"
      title="Поиск ИИ"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 self-stretch rounded-xl border border-primary/50 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 md:px-4",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin md:size-4" />
      ) : (
        <>
          <Wand2 className="size-5 md:hidden" />
          <Sparkles className="hidden size-4 md:block" />
        </>
      )}
      <span className="hidden md:inline">Поиск ИИ</span>
    </button>
  );
}

// Результаты ИИ-поиска — на месте результатов обычного поиска. Карточки те
// же (renderResults), без confidence/similarity. «Отправить заявку админу» —
// только когда ИИ ответил, но уверенного совпадения нет; при ошибке — нет.
export function WorkTypeAiSearchPanel({
  state,
  onClose,
  onRequest,
  renderResults,
}: {
  state: Exclude<WorkTypeAiSearchState, { status: "idle" }>;
  onClose: () => void;
  onRequest: (query: string) => void;
  renderResults: (results: WorkTypeSearchResult[]) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="truncate">
            Поиск ИИ: «{state.query}»
            {state.status === "done" && ` — найдено: ${state.results.length}`}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 font-semibold transition-colors hover:text-foreground"
        >
          <X className="size-4" />
          Обычный поиск
        </button>
      </div>

      {state.status === "loading" ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            ИИ подбирает позиции, это может занять несколько секунд...
          </div>
          <WorkTypeSearchResultsSkeleton />
        </>
      ) : state.status === "error" ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 bg-surface p-8 text-center text-base text-destructive">
          ИИ временно недоступен
        </div>
      ) : (
        <>
          {state.results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-base text-muted-foreground">
              Ничего не найдено
            </div>
          ) : (
            renderResults(state.results)
          )}
          {state.noMatch && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-5 text-center">
              <p className="text-sm text-muted-foreground">Не нашли подходящую позицию?</p>
              <button
                type="button"
                onClick={() => onRequest(state.query)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <FilePlus2 className="size-4" />
                Отправить заявку админу
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
