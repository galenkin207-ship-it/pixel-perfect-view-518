import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // #app-scroll-container — единственный скроллящийся элемент на странице
    // (см. AppShell). Без этой опции роутер при каждой навигации переносит
    // его старую позицию скролла в кэш новой страницы и сам её туда
    // проставляет — из-за этого не срабатывал сброс наверх при переключении
    // страниц в "Все записи" (и потенциально при любой другой навигации).
    scrollToTopSelectors: ["#app-scroll-container"],
    scrollRestorationBehavior: "smooth",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
