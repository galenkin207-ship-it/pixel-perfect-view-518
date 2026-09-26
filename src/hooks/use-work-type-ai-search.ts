import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { WorkTypeSearchResult } from "@/data/work-type-tree";

// Запрос к ИИ может идти несколько секунд, но не бесконечно — дольше
// считаем, что ИИ недоступен.
const AI_SEARCH_TIMEOUT_MS = 30_000;

export type WorkTypeAiSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  // noMatch — даже лучший результат не exact/likely (или ничего не нашлось):
  // предлагаем отправить заявку администратору.
  | { status: "done"; query: string; results: WorkTypeSearchResult[]; noMatch: boolean }
  | { status: "error"; query: string };

// Кнопка «Поиск ИИ» (GET /work-types/search-smart?mode=ai). Работает
// параллельно обычному поиску (useWorkTypeSearch) и его не трогает: по клику
// берёт текущий текст поля, ввод при этом не блокируется. Повторный клик
// перезапускает поиск — ответ предыдущего запроса отбрасывается. Пустое поле
// сбрасывает ИИ-режим обратно к обычному поиску.
export function useWorkTypeAiSearch(query: string) {
  const [state, setState] = useState<WorkTypeAiSearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }, []);

  const run = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), AI_SEARCH_TIMEOUT_MS);
    setState({ status: "loading", query: q });
    try {
      const { items, topConfidence } = await api.searchWorkTypesSmart(q, { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      setState({
        status: "done",
        query: q,
        results: items,
        noMatch: items.length === 0 || topConfidence === "similar" || topConfidence === null,
      });
    } catch {
      if (controllerRef.current !== controller) return;
      setState({ status: "error", query: q });
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) reset();
  }, [query, reset]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, run, reset, active: state.status !== "idle" };
}
