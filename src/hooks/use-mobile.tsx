import * as React from "react";

// Раньше определяли "мобильный" по ширине экрана (< 768px). Из-за этого
// при повороте телефона в альбомную ориентацию ширина вьюпорта у многих
// моделей превышает 768px, и приложение считало устройство "десктопом" —
// хотя это тот же самый телефон, просто повёрнутый.
//
// Вместо ширины проверяем тип указателя: у тач-экранов (телефоны,
// планшеты) `pointer` всегда "coarse" независимо от ориентации, а у
// мыши/трекпада — "fine". Это не меняется при повороте устройства, так
// что мобильный интерфейс остаётся мобильным (просто занимает всю
// доступную ширину), а не переключается на десктопную раскладку.
const MOBILE_QUERY = "(pointer: coarse) and (hover: none)";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
