import { useEffect } from "react";

/**
 * У установленного на iPhone PWA (standalone) есть известный баг Safari:
 * единица `dvh` не пересчитывается корректно сразу после поворота экрана —
 * иногда остаётся "залипшей" на высоте от предыдущей ориентации. Наш
 * основной контейнер раньше использовал фиксированную высоту `h-dvh`
 * (в отличие от `min-h-dvh`, она может обрезать контент, если значение
 * устарело), из-за чего после поворота часть страницы уезжала за пределы
 * экрана, а сам экран переставал скроллиться — прокручивалось только то,
 * что временно "поместилось" в устаревшую высоту.
 *
 * Вместо CSS-единицы dvh считаем реальную высоту сами: `visualViewport`
 * (или `window.innerHeight`, если он недоступен) и кладём её в CSS-
 * переменную `--app-vh`. Пересчитываем при resize, orientationchange и
 * resize самого visualViewport — на iOS после поворота значения обновляются
 * не мгновенно, поэтому дополнительно перепроверяем через небольшую
 * задержку после orientationchange.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;

    const setVh = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-vh", `${height}px`);
    };

    setVh();

    const onOrientationChange = () => {
      setVh();
      // iOS обновляет фактическую высоту viewport с небольшой задержкой
      // после события orientationchange — перепроверяем через момент.
      setTimeout(setVh, 100);
      setTimeout(setVh, 400);
    };

    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", onOrientationChange);
    window.visualViewport?.addEventListener("resize", setVh);

    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", onOrientationChange);
      window.visualViewport?.removeEventListener("resize", setVh);
    };
  }, []);
}
