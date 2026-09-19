import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { WorkTypeSearchResult } from "@/data/work-type-tree";

// Серверный поиск по видам работ (общий эндпоинт покрывает и новый каталог,
// и старые виды работ) с debounce, чтобы не дёргать API на каждое нажатие
// клавиши. results === null — пустой запрос (поиск не активен).
export function useWorkTypeSearch(query: string) {
  const [results, setResults] = useState<WorkTypeSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const queryRef = useRef("");

  useEffect(() => {
    const q = query.trim();
    queryRef.current = q;
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .searchWorkTypes(q)
        .then((items) => {
          if (cancelled) return;
          setResults(items);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Тихое перечитывание текущего запроса (после правки позиции в справочнике)
  // — без состояния "Поиск...", чтобы список не мигал.
  const reload = useCallback(async () => {
    const q = queryRef.current;
    if (!q) return;
    try {
      const items = await api.searchWorkTypes(q);
      if (queryRef.current === q) setResults(items);
    } catch {
      /* оставляем прежние результаты */
    }
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  return { results, loading, reload, removeResult };
}
