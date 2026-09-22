import { useCallback, useState } from "react";

// Кастомные модалки в проекте (createPortal + fixed-overlay, не на Radix
// Dialog) закрываются мгновенно: родитель убирает их из дерева condition'ом
// (`open && <Modal .../>`), и React размонтирует компонент раньше, чем
// успела бы отыграть exit-анимация. AnimatePresence тут не поможет — она
// нужна оборачивать место, откуда элемент убирают, а не сам компонент.
//
// Обходной путь: компонент не размонтируется сразу по клику "закрыть", а
// сначала выставляет локальный флаг `closing` (под него завязана
// framer-motion анимация исчезновения) и только через `durationMs`
// действительно вызывает переданный `onClose` — тогда родитель убирает
// компонент уже после того, как анимация отыграла.
//
// После onClose флаг сбрасывается обратно: там, где хук живёт на уровне
// страницы, а не внутри самой модалки (Фото объекта, окно позиции в отчёте),
// компонент с хуком не размонтируется, и без сброса следующее открытие
// сразу получало бы closing = true — окно появлялось невидимым (opacity 0),
// но перехватывало клики.
export function useModalClose(onClose: () => void, durationMs = 180) {
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, durationMs);
  }, [onClose, durationMs]);
  return { closing, requestClose } as const;
}
