// Минимальный service worker.
// Единственная задача — сделать приложение "устанавливаемым" (PWA install prompt
// в Chrome/Android требует наличие активного service worker с обработчиком fetch).
// Никакого офлайн-кеширования не делаем: все запросы просто идут в сеть напрямую,
// чтобы не сломать работу с актуальными данными.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
